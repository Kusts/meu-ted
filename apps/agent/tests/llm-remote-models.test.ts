import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fetchRemoteModels, clearRemoteModelsCache } from '../src/llm/remote-models.js';

describe('Dynamic remote models (refactor item 3)', () => {
  beforeEach(() => {
    clearRemoteModelsCache();
  });

  it('pulls the model list in real time from the provider API', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'kimi-k2', owned_by: 'moonshot' }] }), { status: 200 }),
    );
    const out = await fetchRemoteModels('kimi', 'test-key-123', { customFetch: fetchMock as unknown as typeof fetch });
    expect(out.cached).toBe(false);
    expect(out.models).toMatchObject([{ id: 'kimi-k2' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.moonshot.ai/v1/models',
      expect.objectContaining({ method: 'GET' }),
    );
    // The key travels only in the header, never in the result payload.
    expect(JSON.stringify(out)).not.toContain('test-key-123');
  });

  it('serves the second call from the short-TTL cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'deepseek-chat' }] }), { status: 200 }),
    );
    const first = await fetchRemoteModels('deepseek', 'k', { customFetch: fetchMock as unknown as typeof fetch });
    const second = await fetchRemoteModels('deepseek', 'k', { customFetch: fetchMock as unknown as typeof fetch });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to manual model id for providers without public listing (codex)', async () => {
    const fetchMock = vi.fn();
    const out = await fetchRemoteModels('openai-codex-subscription', '', {
      customFetch: fetchMock as unknown as typeof fetch,
    });
    expect(out.models).toEqual([]);
    expect(out.manualEntryAllowed).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects upstream HTTP errors with a status-coded error (no secret leak)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(
      fetchRemoteModels('openai', 'super-secret-key', { customFetch: fetchMock as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: 'http_401' });
  });
});
