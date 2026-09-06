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
          activeProvider: {
            id: 'openai-api',
            kind: 'openai-api',
            transport: 'direct',
            authMode: 'api-key',
            secretAlias: 'OPENAI_API_KEY',
            serviceAlias: null,
            eligibility: 'approved',
          },
          activeModel: {
            id: 'openai-api:gpt-4o',
            modelId: 'gpt-4o',
            protocol: 'chat-completions',
            privacyClass: 'training_prohibited',
          },
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
    // Fase 3 item 5: bare upstream name comes from the validated slot.
    expect(config.activeModelName).toBe('gpt-4o');
    expect(config.fallbackModelName).toBeNull();
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
    expect(config.activeModelName).toBeNull();
  });

  it('rejects snapshots without a runtime object', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    globalThis.fetch = fetchMock;

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow();
  });

  it('rejects a malformed snapshot with a typed error (Fase 1b F5 RED)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            singleton: 'active',
            version: 'three',
            securityEpoch: 2,
            activeProviderId: 42,
            activeModelId: 'openai-api:gpt-4o',
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
          activeDisabled: true,
          fallbackDisabled: false,
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow(
      /Invalid runtime snapshot/,
    );
  });

  it('rejects an activeProtocol outside the contract enum (Fase 1b F5 RED)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            ...contractRuntime,
            activeProtocol: 'carrier-pigeon',
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

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow(
      /Invalid runtime snapshot/,
    );
  });

  it('rejects a non-JSON body with status context and an excerpt (Fase 1b F5 RED)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('<html>not json at all</html>', { status: 200 }),
    );
    globalThis.fetch = fetchMock;

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow(
      /Invalid runtime snapshot/,
    );
  });

  it('rejects a structurally valid but semantically incoherent snapshot (Fase 1b-FIX item 9 RED)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            ...contractRuntime,
            activeProviderId: 'openai-api',
            activeModelId: 'openai-api:gpt-4o',
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

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow(
      /Invalid runtime snapshot/,
    );
  });

  it('rejects incoherent fallback flags the same way (Fase 1b-FIX item 9 RED)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: {
            ...contractRuntime,
            fallbackProviderId: 'opencode-zen',
            fallbackModelId: 'opencode-zen:zen-1',
          },
          activeProvider: null,
          activeModel: null,
          fallbackProvider: null,
          fallbackModel: null,
          activeDisabled: false,
          fallbackDisabled: true,
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock;

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow(
      /Invalid runtime snapshot/,
    );
  });

  it.each([
    ['active provider without model', { activeProviderId: 'openai-api', activeModelId: null }],
    ['active model without provider', { activeProviderId: null, activeModelId: 'openai-api:gpt-4o' }],
  ])('rejects incomplete active pair: %s (Fase 2 item 3)', async (_label, pair) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: { ...contractRuntime, ...pair },
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

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow(
      /Invalid runtime snapshot/,
    );
  });

  it.each([
    ['fallback provider without model', { fallbackProviderId: 'opencode-zen', fallbackModelId: null }],
    ['fallback model without provider', { fallbackProviderId: null, fallbackModelId: 'opencode-zen:zen-1' }],
  ])('rejects incomplete fallback pair: %s (Fase 2 item 3)', async (_label, pair) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          runtime: { ...contractRuntime, ...pair },
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

    await expect(fetchRuntimeConfig('https://api.example.test', 'token-123')).rejects.toThrow(
      /Invalid runtime snapshot/,
    );
  });
});
