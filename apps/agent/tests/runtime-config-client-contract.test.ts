import { describe, expect, it, vi } from 'vitest';
import { fetchRuntimeConfig } from '../src/llm/runtime-config-client.js';

const contractRuntime = {
  singleton: 'active',
  version: 3,
  securityEpoch: 2,
  activeProviderId: 'openai-api',
  activeModelId: 'openai-api:gpt-4o',
  activeProtocol: 'chat-completions',
  activeRolloutPercentage: 100,
  activeRolloutMode: 'all',
  canaryAllowlist: [],
  fallbackProviderId: null,
  fallbackModelId: null,
  updatedBy: 'admin@test.com',
};

describe('Runtime Config Client — explicit active* contract (Fase 1a RED)', () => {
  it('reads only active* fields and ignores legacy names and model slots', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            ...contractRuntime,
            providerId: 'legacy-provider-must-be-ignored',
            modelId: 'legacy-model-must-be-ignored',
          },
          activeProvider: { id: 'openai-api' },
          activeModel: { id: 'openai-api:other', modelId: 'other-model-must-be-ignored' },
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
    expect(config.activeProviderId).toBe('openai-api');
    expect(config.activeModelId).toBe('openai-api:gpt-4o');
    expect(config.activeProtocol).toBe('chat-completions');
    expect(config.activeRolloutPercentage).toBe(100);
    expect(config.securityEpoch).toBe(2);
    expect(config.fallbackProviderId).toBeNull();
    expect(config.fallbackModelId).toBeNull();
  });

  it('is fail-closed: legacy ids alone never become usable configuration', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            ...contractRuntime,
            activeProviderId: null,
            activeModelId: null,
            activeProtocol: null,
            providerId: 'openai-api',
            modelId: 'openai-api:gpt-4o',
          },
          activeProvider: null,
          activeModel: null,
          fallbackProvider: null,
          fallbackModel: null,
          activeDisabled: true,
          fallbackDisabled: false,
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;

    const config = await fetchRuntimeConfig('https://api.example.test', 'token-123');
    expect(config.activeProviderId).toBeNull();
    expect(config.activeModelId).toBeNull();
  });

  it('rejects snapshots without a runtime object', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    globalThis.fetch = fetchMock;

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow();
  });
});
