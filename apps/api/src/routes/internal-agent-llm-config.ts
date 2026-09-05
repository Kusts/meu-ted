import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LlmConfigStore } from '../agent/llm-config-postgres.js';
import { toInternalRuntimeDto } from '../agent/runtime-mapper.js';
import type { InternalLlmSnapshot, LlmModelSlot, LlmProviderSlot } from '@pi-finance/llm-contracts';
import { timingSafeEqual } from 'node:crypto';

const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

const toProviderSlot = (
  p: { id: string; kind: LlmProviderSlot['kind']; transport: LlmProviderSlot['transport']; authMode: LlmProviderSlot['authMode']; secretAlias: LlmProviderSlot['secretAlias']; serviceAlias?: string | null | undefined; eligibility: LlmProviderSlot['eligibility'] },
): LlmProviderSlot => ({
  id: p.id,
  kind: p.kind,
  transport: p.transport,
  authMode: p.authMode,
  secretAlias: p.secretAlias,
  serviceAlias: p.serviceAlias ?? null,
  eligibility: p.eligibility,
});

const toModelSlot = (
  m: { id: string; modelId: string; protocol: LlmModelSlot['protocol']; privacyClass: LlmModelSlot['privacyClass'] },
): LlmModelSlot => ({
  id: m.id,
  modelId: m.modelId,
  protocol: m.protocol,
  privacyClass: m.privacyClass,
});

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

    const activeProviderRaw = providers.find((p) => p.id === runtime.providerId) ?? null;
    const activeModelRaw = models.find((m) => m.id === runtime.modelId) ?? null;
    const fallbackProviderRaw = providers.find((p) => p.id === runtime.fallbackProviderId) ?? null;
    const fallbackModelRaw =
      models.find(
        (m) => m.id === runtime.fallbackModelId || (m.providerId === runtime.fallbackProviderId && m.modelId === runtime.fallbackModelId),
      ) ?? null;

    // Fail-closed: a configured pair is usable only when provider and model
    // exist, are enabled, and the model belongs to the provider.
    const activeConfigured = runtime.providerId != null || runtime.modelId != null;
    const activeUsable =
      activeProviderRaw !== null &&
      activeProviderRaw.enabled &&
      activeModelRaw !== null &&
      activeModelRaw.enabled &&
      activeModelRaw.providerId === runtime.providerId;
    const activeDisabled = activeConfigured && !activeUsable;

    const fallbackConfigured = runtime.fallbackProviderId != null || runtime.fallbackModelId != null;
    const fallbackUsable =
      fallbackProviderRaw !== null &&
      fallbackProviderRaw.enabled &&
      fallbackModelRaw !== null &&
      fallbackModelRaw.enabled &&
      fallbackModelRaw.providerId === runtime.fallbackProviderId;
    const fallbackDisabled = fallbackConfigured && !fallbackUsable;

    const dto = toInternalRuntimeDto(runtime, models);
    // Never expose ids of an unusable pair: the consumer only reads active*,
    // so nulling them here fails closed without extra consumer logic.
    const runtimeDto = {
      ...dto,
      ...(activeDisabled ? { activeProviderId: null, activeModelId: null, activeProtocol: null } : {}),
      ...(fallbackDisabled ? { fallbackProviderId: null, fallbackModelId: null } : {}),
    };

    const snapshot: InternalLlmSnapshot = {
      runtime: runtimeDto,
      activeProvider: activeUsable && activeProviderRaw ? toProviderSlot(activeProviderRaw) : null,
      activeModel: activeUsable && activeModelRaw ? toModelSlot(activeModelRaw) : null,
      fallbackProvider: fallbackUsable && fallbackProviderRaw ? toProviderSlot(fallbackProviderRaw) : null,
      fallbackModel: fallbackUsable && fallbackModelRaw ? toModelSlot(fallbackModelRaw) : null,
      activeDisabled,
      fallbackDisabled,
    };
    return reply.send(snapshot);
  });
};
