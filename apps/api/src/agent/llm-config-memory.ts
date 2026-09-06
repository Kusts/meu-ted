import { activationBlocked, type LlmConfigStore } from './llm-config-store.js';
import { validateRuntimePair, type LlmModel, type LlmProvider, type RuntimeConfig } from './llm-config.js';

export const createInMemoryLlmConfigStore = (seed?: {
  providers?: LlmProvider[];
  models?: LlmModel[];
  runtime?: Partial<RuntimeConfig>;
}): LlmConfigStore => {
  let providers: LlmProvider[] = seed?.providers ? [...seed.providers] : [
    {
      id: 'opencode-zen',
      kind: 'opencode-zen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'opencode-go',
      kind: 'opencode-go',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_GO_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'openai-codex-subscription',
      kind: 'openai-codex-subscription',
      transport: 'private-broker',
      authMode: 'chatgpt-browser',
      secretAlias: null,
      enabled: false,
      eligibility: 'experimental_blocked',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'anthropic',
      kind: 'anthropic',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'ANTHROPIC_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'deepseek',
      kind: 'deepseek',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'DEEPSEEK_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'qwen',
      kind: 'qwen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'QWEN_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'glm',
      kind: 'glm',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'GLM_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'minimax',
      kind: 'minimax',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'MINIMAX_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'openrouter',
      kind: 'openrouter',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENROUTER_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
  ];

  let models: LlmModel[] = seed?.models ? [...seed.models] : [];
  let runtime: RuntimeConfig = {
    singleton: 'active',
    providerId: null,
    modelId: null,
    rolloutMode: 'disabled',
    canaryAllowlist: [],
    securityEpoch: 1,
    version: 1,
    ...seed?.runtime,
  };

  return {
    async listProviders() {
      return providers.map((p) => ({ ...p }));
    },
    async getProvider(id: string) {
      const p = providers.find((x) => x.id === id);
      return p ? { ...p } : null;
    },
    async upsertProvider(input) {
      const existingIdx = providers.findIndex((p) => p.id === input.id);
      const existing = existingIdx >= 0 ? providers[existingIdx]! : undefined;
      const provider: LlmProvider = {
        id: input.id,
        kind: input.kind,
        transport: input.transport,
        authMode: input.authMode,
        secretAlias: input.secretAlias,
        // Fase 1b-FIX item 1: preserve existing `enabled` on conflict.
        enabled: existing?.enabled ?? input.enabled ?? false,
        eligibility: input.eligibility ?? 'approved',
        runtimeStatus: input.runtimeStatus ?? 'not_configured',
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) providers[existingIdx] = provider;
      else providers.push(provider);
      return { ...provider };
    },
    async deleteProvider(id: string) {
      if (runtime.providerId === id) {
        throw Object.assign(new Error('provider is active runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'active_provider',
        });
      }
      if (runtime.fallbackProviderId === id) {
        throw Object.assign(new Error('provider is fallback runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'fallback_provider',
        });
      }
      providers = providers.filter((p) => p.id !== id);
      models = models.filter((m) => m.providerId !== id);
    },
    async listModels() {
      return models.map((m) => ({ ...m }));
    },
    async getModel(id: string) {
      const m = models.find((x) => x.id === id);
      return m ? { ...m } : null;
    },
    async getRuntime() {
      return { ...runtime, canaryAllowlist: [...runtime.canaryAllowlist] };
    },
    async updateRuntime(input) {
      if (runtime.version !== input.expectedVersion) {
        throw Object.assign(new Error('version conflict'), {
          statusCode: 409,
          code: 'agent.version_conflict',
        });
      }
      // Fase 1b-FIX item 6: same revalidation as Postgres (single-threaded
      // here, so no locks needed — same decisions).
      const findProvider = (id: string | null) =>
        id === null ? null : (providers.find((p) => p.id === id) ?? null);
      const findModel = (id: string | null) =>
        id === null ? null : (models.find((m) => m.id === id) ?? null);
      const activeErr = validateRuntimePair(findProvider(input.providerId), findModel(input.modelId));
      if (activeErr) throw activationBlocked(activeErr);
      const effectiveFallbackProviderId =
        input.fallbackProviderId !== undefined ? input.fallbackProviderId : (runtime.fallbackProviderId ?? null);
      const effectiveFallbackModelId =
        input.fallbackModelId !== undefined ? input.fallbackModelId : (runtime.fallbackModelId ?? null);
      const fallbackErr = validateRuntimePair(
        findProvider(effectiveFallbackProviderId),
        findModel(effectiveFallbackModelId),
      );
      if (fallbackErr) throw activationBlocked(fallbackErr);
      runtime = {
        ...runtime,
        providerId: input.providerId,
        modelId: input.modelId,
        ...(input.fallbackProviderId !== undefined ? { fallbackProviderId: input.fallbackProviderId } : {}),
        ...(input.fallbackModelId !== undefined ? { fallbackModelId: input.fallbackModelId } : {}),
        rolloutMode: input.rolloutMode ?? runtime.rolloutMode,
        canaryAllowlist: input.canaryAllowlist ? [...input.canaryAllowlist] : runtime.canaryAllowlist,
        version: runtime.version + 1,
        updatedBy: input.updatedBy,
        updatedAt: new Date().toISOString(),
      };
      return { ...runtime, canaryAllowlist: [...runtime.canaryAllowlist] };
    },
    async setProviderEnabled(id, enabled) {
      const p = providers.find((x) => x.id === id);
      if (!p) throw Object.assign(new Error(`provider ${id} not found`), { statusCode: 404 });
      if (!enabled) {
        if (runtime.providerId === id) {
          throw Object.assign(new Error('provider is active runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'active_provider',
          });
        }
        if (runtime.fallbackProviderId === id) {
          throw Object.assign(new Error('provider is fallback runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'fallback_provider',
          });
        }
      }
      p.enabled = enabled;
      p.updatedAt = new Date().toISOString();
      return { ...p };
    },
    async setProviderRuntimeStatus(id, status) {
      const p = providers.find((x) => x.id === id);
      if (!p) throw Object.assign(new Error(`provider ${id} not found`), { statusCode: 404 });
      p.runtimeStatus = status;
      p.updatedAt = new Date().toISOString();
      return { ...p };
    },
    async setModelEnabled(id, enabled) {
      const m = models.find((x) => x.id === id);
      if (!m) throw Object.assign(new Error(`model ${id} not found`), { statusCode: 404 });
      if (!enabled) {
        if (runtime.modelId === id) {
          throw Object.assign(new Error('model is active runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'active_model',
          });
        }
        if (runtime.fallbackModelId === id) {
          throw Object.assign(new Error('model is fallback runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'fallback_model',
          });
        }
      }
      m.enabled = enabled;
      return { ...m };
    },
    async upsertModel(input) {
      const id = input.id ?? `${input.providerId}:${input.modelId}`;
      const existingIdx = models.findIndex(
        (m) => m.id === id || (m.providerId === input.providerId && m.modelId === input.modelId),
      );
      const existingModel = existingIdx >= 0 ? models[existingIdx]! : undefined;
      const model: LlmModel = {
        id,
        providerId: input.providerId,
        modelId: input.modelId,
        protocol: input.protocol,
        privacyClass: input.privacyClass,
        retention: input.retention ?? null,
        // Fase 1b-FIX item 1: preserve existing `enabled` on conflict.
        enabled: existingModel?.enabled ?? input.enabled ?? false,
        createdAt: existingModel?.createdAt ?? new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        models[existingIdx] = model;
      } else {
        models.push(model);
      }
      return { ...model };
    },
    async deleteModel(id: string) {
      if (runtime.modelId === id) {
        throw Object.assign(new Error('model is active runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'active_model',
        });
      }
      if (runtime.fallbackModelId === id) {
        throw Object.assign(new Error('model is fallback runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'fallback_model',
        });
      }
      models = models.filter((m) => m.id !== id);
    },
    async bumpSecurityEpoch(updatedBy?: string) {
      runtime = {
        ...runtime,
        securityEpoch: runtime.securityEpoch + 1,
        version: runtime.version + 1,
        updatedBy: updatedBy ?? runtime.updatedBy,
        updatedAt: new Date().toISOString(),
      };
      return { ...runtime, canaryAllowlist: [...runtime.canaryAllowlist] };
    },
  };
};
