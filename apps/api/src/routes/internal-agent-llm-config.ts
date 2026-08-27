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

    const activeProvider = providers.find((p) => p.id === runtime.providerId);
    const activeModel = models.find((m) => m.id === runtime.modelId);

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
      runtime: {
        singleton: runtime.singleton,
        providerId: runtime.providerId,
        modelId: runtime.modelId,
        rolloutMode: runtime.rolloutMode,
        canaryAllowlist: runtime.canaryAllowlist,
        securityEpoch: runtime.securityEpoch,
        version: runtime.version,
      },
    });
  });
};

