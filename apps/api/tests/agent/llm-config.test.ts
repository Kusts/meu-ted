import { describe, expect, it } from 'vitest';
import {
  ALLOWED_KINDS,
  ALLOWED_PRIVACY_CLASSES,
  ALLOWED_PROTOCOLS,
  ALLOWED_ROLLOUT_MODES,
  ALLOWED_SECRET_ALIASES,
  canActivate,
  isCompatibleTransportAuth,
  validateModel,
  validateProvider,
  type LlmModel,
  type LlmProvider,
} from '../../src/agent/llm-config.js';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-postgres.js';

describe('LLM Config Domain Validation (RED -> GREEN)', () => {
  describe('Constants and Enums', () => {
    it('defines allowlisted provider kinds including popular presets', () => {
      expect(ALLOWED_KINDS).toEqual(expect.arrayContaining([
        'opencode-zen',
        'opencode-go',
        'openai-api',
        'openai-codex-subscription',
        'anthropic',
        'deepseek',
        'qwen',
        'glm',
        'minimax',
        'openrouter',
      ]));
      expect(ALLOWED_KINDS.length).toBeGreaterThanOrEqual(10);
    });

    it('defines allowlisted secret aliases including new providers', () => {
      expect(ALLOWED_SECRET_ALIASES).toEqual(expect.arrayContaining([
        'OPENCODE_ZEN_API_KEY',
        'OPENCODE_GO_API_KEY',
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY',
        'DEEPSEEK_API_KEY',
        'QWEN_API_KEY',
        'GLM_API_KEY',
        'MINIMAX_API_KEY',
      ]));
      expect(ALLOWED_SECRET_ALIASES.length).toBeGreaterThanOrEqual(8);
    });

    it('defines allowlisted protocols', () => {
      expect(ALLOWED_PROTOCOLS).toEqual([
        'responses',
        'messages',
        'chat-completions',
        'google-generative-ai',
      ]);
    });

    it('defines rollout modes and privacy classes', () => {
      expect(ALLOWED_ROLLOUT_MODES).toEqual(['disabled', 'canary', 'all']);
      expect(ALLOWED_PRIVACY_CLASSES).toEqual(['training_prohibited', 'training_allowed']);
    });
  });

  describe('isCompatibleTransportAuth', () => {
    it('accepts direct + api-key', () => {
      expect(isCompatibleTransportAuth('direct', 'api-key')).toBe(true);
    });

    it('accepts private-broker + chatgpt-browser', () => {
      expect(isCompatibleTransportAuth('private-broker', 'chatgpt-browser')).toBe(true);
    });

    it('rejects incompatible combinations', () => {
      expect(isCompatibleTransportAuth('direct', 'chatgpt-browser')).toBe(false);
      expect(isCompatibleTransportAuth('private-broker', 'api-key')).toBe(false);
    });
  });

  describe('validateProvider', () => {
    it('accepts valid direct API provider with secret alias', () => {
      expect(
        validateProvider({
          id: 'opencode-zen',
          kind: 'opencode-zen',
          transport: 'direct',
          authMode: 'api-key',
          secretAlias: 'OPENCODE_ZEN_API_KEY',
          enabled: true,
          eligibility: 'approved',
          runtimeStatus: 'not_configured',
        }),
      ).toBeNull();
    });

    it('accepts valid codex subscription provider with null secret alias', () => {
      expect(
        validateProvider({
          id: 'openai-codex-subscription',
          kind: 'openai-codex-subscription',
          transport: 'private-broker',
          authMode: 'chatgpt-browser',
          secretAlias: null,
          enabled: false,
          eligibility: 'experimental_blocked',
          runtimeStatus: 'not_configured',
        }),
      ).toBeNull();
    });

    it('rejects invalid kind', () => {
      expect(
        validateProvider({
          id: 'unknown-kind',
          kind: 'unknown-kind' as never,
          transport: 'direct',
          authMode: 'api-key',
          secretAlias: 'OPENAI_API_KEY',
        }),
      ).toBe('invalid kind');
    });

    it('rejects incompatible transport/auth', () => {
      expect(
        validateProvider({
          id: 'opencode-zen',
          kind: 'opencode-zen',
          transport: 'direct',
          authMode: 'chatgpt-browser',
          secretAlias: 'OPENCODE_ZEN_API_KEY',
        }),
      ).toBe('incompatible transport/auth');
    });

    it('rejects codex subscription with raw or non-null secret alias', () => {
      expect(
        validateProvider({
          id: 'openai-codex-subscription',
          kind: 'openai-codex-subscription',
          transport: 'private-broker',
          authMode: 'chatgpt-browser',
          secretAlias: 'OPENAI_API_KEY' as never,
        }),
      ).toBe('codex must not have secret alias');
    });

    it('rejects direct provider with unknown secret alias', () => {
      expect(
        validateProvider({
          id: 'openai-api',
          kind: 'openai-api',
          transport: 'direct',
          authMode: 'api-key',
          secretAlias: 'UNKNOWN_SECRET' as never,
        }),
      ).toBe('invalid secret alias');
    });

    it('rejects secret alias that does not belong to the kind', () => {
      expect(
        validateProvider({
          id: 'custom-anthropic',
          kind: 'anthropic',
          transport: 'direct',
          authMode: 'api-key',
          secretAlias: 'OPENCODE_ZEN_API_KEY',
        }),
      ).toBe('invalid secret alias for kind anthropic: OPENCODE_ZEN_API_KEY');
    });
  });

  describe('validateModel', () => {
    it('accepts valid model definitions', () => {
      expect(
        validateModel({
          providerId: 'openai-api',
          modelId: 'gpt-4o',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
        }),
      ).toBeNull();
    });

    it('rejects missing providerId or modelId', () => {
      expect(
        validateModel({
          providerId: '',
          modelId: 'gpt-4o',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
        }),
      ).toBe('providerId is required');

      expect(
        validateModel({
          providerId: 'openai-api',
          modelId: '',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
        }),
      ).toBe('modelId is required');
    });

    it('rejects invalid protocol or privacy class', () => {
      expect(
        validateModel({
          providerId: 'openai-api',
          modelId: 'gpt-4o',
          protocol: 'unknown-protocol' as never,
          privacyClass: 'training_prohibited',
        }),
      ).toBe('invalid protocol');

      expect(
        validateModel({
          providerId: 'openai-api',
          modelId: 'gpt-4o',
          protocol: 'chat-completions',
          privacyClass: 'invalid-privacy' as never,
        }),
      ).toBe('invalid privacy class');
    });
  });

  describe('canActivate', () => {
    const validProvider: LlmProvider = {
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      enabled: true,
      eligibility: 'approved',
      runtimeStatus: 'ready',
    };

    const validModel: LlmModel = {
      id: 'openai-api:gpt-4o',
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    };

    it('allows activating valid approved provider and model', () => {
      expect(canActivate(validProvider, validModel)).toBeNull();
    });

    it('blocks activation if provider is missing or model is missing', () => {
      expect(canActivate(undefined, validModel)).toBe('provider and model are required');
      expect(canActivate(validProvider, undefined)).toBe('provider and model are required');
    });

    it('blocks activation if provider eligibility is not approved', () => {
      const blockedProvider: LlmProvider = {
        ...validProvider,
        id: 'openai-codex-subscription',
        kind: 'openai-codex-subscription',
        transport: 'private-broker',
        authMode: 'chatgpt-browser',
        secretAlias: null,
        eligibility: 'experimental_blocked',
      };
      expect(canActivate(blockedProvider, validModel)).toBe('provider is not approved for activation');
    });

    it('blocks activation if provider is disabled', () => {
      expect(canActivate({ ...validProvider, enabled: false }, validModel)).toBe('provider is disabled');
    });

    it('blocks activation if model is disabled', () => {
      expect(canActivate(validProvider, { ...validModel, enabled: false })).toBe('model is disabled');
    });

    it('blocks activation if model privacyClass is training_allowed', () => {
      expect(
        canActivate(validProvider, { ...validModel, privacyClass: 'training_allowed' }),
      ).toBe('model with training_allowed is blocked');
    });

    it('blocks activation if model protocol is invalid', () => {
      expect(
        canActivate(validProvider, { ...validModel, protocol: 'invalid-proto' as never }),
      ).toBe('invalid model protocol');
    });

    it('blocks activation if provider kind is not executable (Fase 1b-FIX item 3)', () => {
      const codexProvider: LlmProvider = {
        ...validProvider,
        id: 'openai-codex-subscription',
        kind: 'openai-codex-subscription',
        transport: 'private-broker',
        authMode: 'chatgpt-browser',
        secretAlias: null,
        eligibility: 'approved',
      };
      expect(canActivate(codexProvider, validModel)).toBe(
        'provider kind openai-codex-subscription is not executable by the agent runtime',
      );
    });
  });
});

describe('In-Memory LLM Config Store', () => {
  it('initializes with default seed providers and disabled active runtime including new presets', async () => {
    const store = createInMemoryLlmConfigStore();
    const providers = await store.listProviders();
    expect(providers.length).toBeGreaterThanOrEqual(10);
    const ids = providers.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([
      'opencode-zen',
      'opencode-go',
      'openai-api',
      'openai-codex-subscription',
      'anthropic',
      'deepseek',
      'qwen',
      'glm',
      'minimax',
      'openrouter',
    ]));

    const runtime = await store.getRuntime();
    expect(runtime).toMatchObject({
      singleton: 'active',
      providerId: null,
      modelId: null,
      rolloutMode: 'disabled',
      canaryAllowlist: [],
      securityEpoch: 1,
      version: 1,
    });
  });

  it('manages models (upsert, get, list, toggle, delete)', async () => {
    const store = createInMemoryLlmConfigStore();
    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: false,
    });
    expect(model.id).toBe('openai-api:gpt-4o');
    expect(model.enabled).toBe(false);

    const fetched = await store.getModel('openai-api:gpt-4o');
    expect(fetched).toMatchObject({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
    });

    const toggled = await store.setModelEnabled('openai-api:gpt-4o', true);
    expect(toggled.enabled).toBe(true);

    const allModels = await store.listModels();
    expect(allModels).toHaveLength(1);

    await store.deleteModel('openai-api:gpt-4o');
    expect(await store.listModels()).toHaveLength(0);
  });

  it('manages provider enabled and runtimeStatus', async () => {
    const store = createInMemoryLlmConfigStore();
    const toggled = await store.setProviderEnabled('opencode-zen', true);
    expect(toggled.enabled).toBe(true);

    const statusUpdated = await store.setProviderRuntimeStatus('opencode-zen', 'ready');
    expect(statusUpdated.runtimeStatus).toBe('ready');

    const provider = await store.getProvider('opencode-zen');
    expect(provider?.enabled).toBe(true);
    expect(provider?.runtimeStatus).toBe('ready');
  });

  it('updates runtime with optimistic concurrency (version compare-and-swap)', async () => {
    const store = createInMemoryLlmConfigStore();
    // updateRuntime revalidates pairs (Fase 1b-FIX item 6): seed an enabled pair first.
    await store.setProviderEnabled('openai-api', true);
    const seedModel = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(seedModel.id, true);
    const r1 = await store.getRuntime();

    const updated = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: seedModel.id,
      rolloutMode: 'canary',
      canaryAllowlist: ['ws-1'],
      expectedVersion: r1.version,
      updatedBy: 'admin@example.com',
    });

    expect(updated.version).toBe(2);
    expect(updated.providerId).toBe('openai-api');
    expect(updated.rolloutMode).toBe('canary');
    expect(updated.canaryAllowlist).toEqual(['ws-1']);

    // Attempting update with stale version 1 must throw 409
    await expect(
      store.updateRuntime({
        providerId: 'opencode-zen',
        modelId: 'opencode-zen:default',
        expectedVersion: 1,
        updatedBy: 'admin@example.com',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.version_conflict',
    });
  });

  it('bumps securityEpoch and increments version', async () => {
    const store = createInMemoryLlmConfigStore();
    const r1 = await store.getRuntime();
    expect(r1.securityEpoch).toBe(1);

    const r2 = await store.bumpSecurityEpoch('admin@example.com');
    expect(r2.securityEpoch).toBe(2);
    expect(r2.version).toBe(2);
  });
});
