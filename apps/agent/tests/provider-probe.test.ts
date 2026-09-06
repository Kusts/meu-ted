import { describe, expect, it, vi } from 'vitest';
import { probeProvider } from '../src/llm/provider-probe.js';

describe('Provider Probe (Task 5)', () => {
  it('returns missing_secret when secret is not configured in env', async () => {
    const result = await probeProvider('openai-api', 'gpt-4o-mini', {});
    expect(result).toMatchObject({
      ready: false,
      provider: 'openai-api',
      model: 'gpt-4o-mini',
      transport: 'direct',
      authMode: 'api-key',
      code: 'missing_secret',
    });
  });

  it('probes upstream models endpoint and returns ok when 200', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }));

    const result = await probeProvider(
      'openai-api',
      'gpt-4o-mini',
      { OPENAI_API_KEY: 'test-key-123' },
      fetchMock,
    );

    expect(result.ready).toBe(true);
    expect(result.code).toBe('ok');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledWith('https://api.openai.com/v1/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        authorization: 'Bearer test-key-123',
      }),
      redirect: 'manual',
    }));
  });

  it('handles HTTP error without crashing and reports error code', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    const result = await probeProvider(
      'opencode-zen',
      'claude-3-5-sonnet',
      { OPENCODE_ZEN_API_KEY: 'invalid-key' },
      fetchMock,
    );

    expect(result.ready).toBe(false);
    expect(result.code).toBe('http_401');
  });

  it('rejects invalid model IDs with special characters before making network calls', async () => {
    const fetchMock = vi.fn();

    const result = await probeProvider(
      'openai-api',
      'gpt-4o?exploit=1',
      { OPENAI_API_KEY: 'valid-key' },
      fetchMock,
    );

    expect(result.ready).toBe(false);
    expect(result.code).toBe('invalid_model_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('probes an owner/model id end to end (Fase 1b-FIX item 8)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }));

    const result = await probeProvider(
      'openrouter',
      'meta-llama/llama-3-8b',
      { OPENROUTER_API_KEY: 'test-key-123' },
      fetchMock,
    );

    expect(result.ready).toBe(true);
    expect(result.code).toBe('ok');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('clears its timeout even when the request fails (Fase 1b-FIX item 8)', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed'));
      const result = await probeProvider(
        'openai-api',
        'gpt-4o-mini',
        { OPENAI_API_KEY: 'valid-key' },
        fetchMock,
      );
      expect(result).toMatchObject({ ready: false, code: 'network_error' });
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('never leaks the Google key in error details (Fase 2 item 2)', async () => {
    const secret = 'google-secret-value-xyz';
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('socket hang up'));
    const result = await probeProvider(
      'google',
      'gemini-2.0-flash',
      { GOOGLE_API_KEY: secret },
      fetchMock,
    );
    expect(result).toMatchObject({ ready: false, code: 'network_error' });
    // Error detail must identify the endpoint but never the secret value.
    expect(result.detail).toBeDefined();
    expect(result.detail).toContain('/models');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain('key=');
  });
});
