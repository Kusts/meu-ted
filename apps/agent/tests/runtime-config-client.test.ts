import { describe, expect, it, vi } from 'vitest';
import { fetchRuntimeConfig, RuntimeSnapshotError } from '../src/llm/runtime-config-client.js';

describe('Runtime Config Client (Task 5)', () => {
  it('fetches and normalizes runtime configuration with auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            singleton: 'active',
            version: 3,
            securityEpoch: 2,
            activeProviderId: 'openai-api',
            activeModelId: 'gpt-4o-mini',
            activeProtocol: 'chat-completions',
            activeRolloutPercentage: 100,
            activeRolloutMode: 'all',
            fallbackProviderId: null,
            fallbackModelId: null,
            updatedBy: null,
          },
          activeProvider: null,
          activeModel: null,
          fallbackProvider: null,
          fallbackModel: null,
          activeDisabled: false,
          fallbackDisabled: false,
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;

    const config = await fetchRuntimeConfig('https://api.example.test', 'token-123');
    expect(config).toEqual({
      version: 3,
      activeProviderId: 'openai-api',
      activeModelId: 'gpt-4o-mini',
      fallbackProviderId: null,
      fallbackModelId: null,
      activeProtocol: 'chat-completions',
      activeRolloutPercentage: 100,
      securityEpoch: 2,
      // Fase 3 item 5: no model slots in this payload -> bare names are null.
      activeModelName: null,
      fallbackModelName: null,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/internal/agent/llm-config', expect.objectContaining({
      method: 'GET',
      headers: {
        'x-agent-config-token': 'token-123',
        accept: 'application/json',
      },
    }));
  });

  it('throws when HTTP status is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );
    globalThis.fetch = fetchMock;

    await expect(fetchRuntimeConfig('https://api.example.test', 'invalid-token')).rejects.toThrow(
      /HTTP 401/,
    );
  });

  it('throws a typed timeout error when fetch hangs (Fase 3 item 8)', async () => {
    const fetchMock = vi.fn().mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
          );
        }),
    );
    globalThis.fetch = fetchMock;

    const err = await fetchRuntimeConfig('https://api.example.test', 'token-123', {
      timeoutMs: 50,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RuntimeSnapshotError);
    expect((err as Error).message).toMatch(/timed out|timeout/i);
  }, 10_000);
});
