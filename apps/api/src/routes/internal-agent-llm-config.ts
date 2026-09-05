import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LlmConfigStore } from '../agent/llm-config-postgres.js';
import { timingSafeEqual } from 'node:crypto';

const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

export const registerInternalAgentLlmConfigRoutes = (
  app: FastifyInstance,
  deps: { store: LlmConfigStore; configToken: string },
): void => {
  app.get('/internal/agent/llm-config', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawHeader = req.headers['x-agent-config-token'] ?? req.headers['authorization'];
    const token = typeof rawHeader === 'string'
      ? (rawHeader.startsWith('Bearer ') ? rawHeader.slice('Bearer '.length).trim() : rawHeader.trim())
      : null;

    if (!token || !deps.configToken || !safeCompare(token, deps.configToken)) {
      return reply.code(401).send({
        code: 'auth.invalid_token',
        message: 'Token de configuração interna inválido ou ausente.',
      });
    }

    const [providers, models, runtime] = await Promise.all([
      deps.store.listProviders(),
      deps.store.listModels(),
      deps.store.getRuntime(),
    ]);

    let activeProvider = providers.find((p) => p.id === runtime.providerId) ?? null;
    let activeModel = models.find((m) => m.id === runtime.modelId) ?? null;
    const fallbackProvider = providers.find((p) => p.id === runtime.fallbackProviderId) ?? null;
    const fallbackModel = models.find((m) => m.id === runtime.fallbackModelId || (m.providerId === runtime.fallbackProviderId && m.modelId === runtime.fallbackModelId)) ?? null;
    // Defesa em profundidade: se provider ou model ativo estiver desabilitado, não exponha config utilizável
    if (activeProvider && !activeProvider.enabled) {
      activeProvider = null;
      activeModel = null;
    } else if (activeModel && !activeModel.enabled) {
      activeProvider = null;
      activeModel = null;
    }

    return reply.send({
      provider: activeProvider
        ? {
            id: activeProvider.id,
            kind: activeProvider.kind,
            transport: activeProvider.transport,
            authMode: activeProvider.authMode,
            secretAlias: activeProvider.secretAlias,
            serviceAlias: activeProvider.serviceAlias ?? null,
            eligibility: activeProvider.eligibility,
          }
        : null,
      model: activeModel
        ? {
            id: activeModel.id,
            modelId: activeModel.modelId,
            protocol: activeModel.protocol,
            privacyClass: activeModel.privacyClass,
          }
        : null,
      fallbackProvider: fallbackProvider
        ? {
            id: fallbackProvider.id,
            kind: fallbackProvider.kind,
            transport: fallbackProvider.transport,
            authMode: fallbackProvider.authMode,
            secretAlias: fallbackProvider.secretAlias,
            serviceAlias: fallbackProvider.serviceAlias ?? null,
            eligibility: fallbackProvider.eligibility,
          }
        : null,
      fallbackModel: fallbackModel
        ? {
            id: fallbackModel.id,
            modelId: fallbackModel.modelId,
            protocol: fallbackModel.protocol,
            privacyClass: fallbackModel.privacyClass,
          }
        : null,
      runtime: {
        singleton: runtime.singleton,
        providerId: runtime.providerId,
        modelId: runtime.modelId,
        fallbackProviderId: runtime.fallbackProviderId ?? null,
        fallbackModelId: runtime.fallbackModelId ?? null,
        rolloutMode: runtime.rolloutMode,
        canaryAllowlist: runtime.canaryAllowlist,
        securityEpoch: runtime.securityEpoch,
        version: runtime.version,
      },
    });
  });
};

