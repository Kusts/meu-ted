import { describe, expect, it, vi } from 'vitest';
import { fetchRuntimeConfig } from '../src/llm/runtime-config-client.js';

describe('Runtime Config Client (Task 5)', () => {
  it('fetches and normalizes runtime configuration with auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            version: 3,
            activeProviderId: 'openai-api',
            activeModelId: 'gpt-4o-mini',
            activeProtocol: 'chat-completions',
            activeRolloutPercentage: 100,
            securityEpoch: 2,
          },
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
      catalogVersion: undefined,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/internal/agent/llm-config', {
      method: 'GET',
      headers: {
        'x-agent-config-token': 'token-123',
        accept: 'application/json',
      },
    });
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
});
