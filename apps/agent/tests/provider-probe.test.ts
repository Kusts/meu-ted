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
      'gpt-4o/exploit',
      { OPENAI_API_KEY: 'valid-key' },
      fetchMock,
    );

    expect(result.ready).toBe(false);
    expect(result.code).toBe('invalid_model_id');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
