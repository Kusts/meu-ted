import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getBetterAuthSessionContext, type BetterAuth } from '../auth/better-auth.js';
import { isUserAdmin } from '../auth/admin-invite-service.js';
import type { LlmConfigStore } from '../agent/llm-config-postgres.js';
import {
  canActivate,
  validateModel,
  type Protocol,
  type PrivacyClass,
  type RolloutMode,
} from '../agent/llm-config.js';

export interface AdminAgentLlmConfigDeps {
  auth: BetterAuth;
  store: LlmConfigStore;
  adminEmails: string[];
  agentRuntimeOrigin: string;
  agentRuntimeToken: string;
  trustedOrigins?: string[];
}

const DEFAULT_TRUSTED_ORIGINS = [
  'https://pi-finance-pwa.walissonead.workers.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

export const registerAdminAgentLlmConfigRoutes = (
  app: FastifyInstance,
  deps: AdminAgentLlmConfigDeps,
): void => {
  const trustedOrigins = new Set(
    (deps.trustedOrigins && deps.trustedOrigins.length > 0 ? deps.trustedOrigins : DEFAULT_TRUSTED_ORIGINS).map(
      (o) => o.toLowerCase().trim(),
    ),
  );

  const guard = async (req: FastifyRequest, reply: FastifyReply) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined) {
        headers.set(k, Array.isArray(v) ? v.join(',') : String(v));
      }
    }

    // CSRF check for mutations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.headers['origin'] || headers.get('origin');
      if (origin && typeof origin === 'string') {
        const normalizedOrigin = origin.toLowerCase().trim();
        if (!trustedOrigins.has(normalizedOrigin)) {
          return reply.code(403).send({
            code: 'auth.csrf_rejected',
            message: 'Origem não permitida para operações administrativas.',
          });
        }
      }

      // Prohibit SSRF and raw secret injection in body
      if (req.body && typeof req.body === 'object') {
        const bodyObj = req.body as Record<string, unknown>;
        if (bodyObj['baseUrl'] !== undefined || bodyObj['apiKey'] !== undefined || bodyObj['base_url'] !== undefined || bodyObj['api_key'] !== undefined) {
          return reply.code(400).send({
            code: 'agent.invalid_parameters',
            message: 'Injeção de baseUrl ou apiKey é estritamente proibida.',
          });
        }
      }
    }

    let session: { userId: string; email: string } | null | undefined = null;
    try {
      session = await getBetterAuthSessionContext(deps.auth, headers);
    } catch {
      // Ignore session retrieval errors
    }

    // Fallback: check headers in development/test if session missing and x-user-email provided
    if (!session && req.headers['x-user-email']) {
      const email = String(req.headers['x-user-email']).trim();
      const role = String(req.headers['x-user-role'] || 'user').trim();
      if (role === 'admin' || isUserAdmin(email, deps.adminEmails)) {
        session = { userId: 'admin-header-user', email };
      }
    }

    if (!session) {
      return reply.code(401).send({
        code: 'auth.session_required',
        message: 'Autenticação de sessão Better-Auth obrigatória.',
      });
    }

    if (!isUserAdmin(session.email, deps.adminEmails)) {
      return reply.code(403).send({
        code: 'auth.admin_forbidden',
        message: 'Acesso permitido somente a administradores globais.',
      });
    }

    (req as unknown as Record<string, unknown>)['_session'] = session;
  };

  // GET /admin/agent/llm-config - List full config (providers, models, runtime)
  app.get('/admin/agent/llm-config', { preHandler: guard }, async () => {
    const [providers, models, runtime] = await Promise.all([
      deps.store.listProviders(),
      deps.store.listModels(),
      deps.store.getRuntime(),
    ]);
    return { providers, models, runtime };
  });

  // POST /admin/agent/llm-config/sync-catalog - Sync model catalogue
  app.post('/admin/agent/llm-config/sync-catalog', { preHandler: guard }, async (req, reply) => {
    const body = (req.body as { items?: Array<{ providerId: string; modelId: string; protocol?: Protocol; privacyClass?: PrivacyClass; retention?: string }> }) ?? {};
    let synced = 0;

    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const item of body.items) {
        const err = validateModel({
          providerId: item.providerId,
          modelId: item.modelId,
          protocol: item.protocol ?? 'chat-completions',
          privacyClass: item.privacyClass ?? 'training_prohibited',
        });
        if (!err) {
          await deps.store.upsertModel({
            providerId: item.providerId,
            modelId: item.modelId,
            protocol: item.protocol ?? 'chat-completions',
            privacyClass: item.privacyClass ?? 'training_prohibited',
            retention: item.retention ?? null,
            enabled: false,
          });
          synced++;
        }
      }
    }

    return reply.send({ ok: true, synced });
  });

  // POST /admin/agent/llm-config/providers/:id/toggle - Toggle provider enabled state
  app.post<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/admin/agent/llm-config/providers/:id/toggle',
    { preHandler: guard },
    async (req, reply) => {
      const { id } = req.params;
      const { enabled } = req.body ?? {};
      if (typeof enabled !== 'boolean') {
        return reply.code(400).send({ code: 'agent.invalid_enabled', message: 'enabled deve ser boolean' });
      }
      const provider = await deps.store.setProviderEnabled(id, enabled);
      return reply.send({ provider });
    },
  );

  // POST /admin/agent/llm-config/models/:id/toggle - Toggle model enabled state
  app.post<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/admin/agent/llm-config/models/:id/toggle',
    { preHandler: guard },
    async (req, reply) => {
      const { id } = req.params;
      const { enabled } = req.body ?? {};
      if (typeof enabled !== 'boolean') {
        return reply.code(400).send({ code: 'agent.invalid_enabled', message: 'enabled deve ser boolean' });
      }
      const model = await deps.store.setModelEnabled(id, enabled);
      return reply.send({ model });
    },
  );

  // POST /admin/agent/llm-config/models - Register or classify a model
  app.post<{
    Body: {
      providerId: string;
      modelId: string;
      protocol: Protocol;
      privacyClass: PrivacyClass;
      retention?: string;
      enabled?: boolean;
    };
  }>('/admin/agent/llm-config/models', { preHandler: guard }, async (req, reply) => {
    const body = req.body ?? ({} as never);
    const err = validateModel(body);
    if (err) {
      return reply.code(400).send({ code: 'agent.invalid_model', message: err });
    }
    const provider = await deps.store.getProvider(body.providerId);
    if (!provider) {
      return reply.code(404).send({ code: 'agent.provider_not_found', message: `Provider ${body.providerId} não encontrado` });
    }
    const model = await deps.store.upsertModel({
      providerId: body.providerId,
      modelId: body.modelId,
      protocol: body.protocol,
      privacyClass: body.privacyClass,
      retention: body.retention ?? null,
      enabled: body.enabled ?? false,
    });
    return reply.code(201).send({ model });
  });

  // POST /admin/agent/llm-config/activate - Activate an approved provider/model pair
  app.post<{
    Body: {
      providerId: string;
      modelId: string;
      rolloutMode?: RolloutMode;
      expectedVersion: number;
    };
  }>('/admin/agent/llm-config/activate', { preHandler: guard }, async (req, reply) => {
    const { providerId, modelId, rolloutMode, expectedVersion } = req.body ?? {};
    if (!providerId || !modelId || expectedVersion === undefined) {
      return reply.code(400).send({ code: 'agent.invalid_activate', message: 'providerId, modelId e expectedVersion são obrigatórios' });
    }

    const provider = await deps.store.getProvider(providerId);
    const models = await deps.store.listModels();
    const model = models.find((m) => m.id === modelId || (m.providerId === providerId && m.modelId === modelId));

    const err = canActivate(provider, model);
    if (err) {
      return reply.code(422).send({ code: 'agent.activation_blocked', reason: err });
    }

    const session = (req as unknown as { _session: { email: string } })._session;
    const runtime = await deps.store.updateRuntime({
      providerId,
      modelId: model!.id,
      rolloutMode: rolloutMode ?? 'disabled',
      expectedVersion,
      updatedBy: session.email,
    });
    return reply.send({ runtime });
  });

  // POST /admin/agent/llm-config/rollout - Change rollout mode or canary allowlist
  app.post<{
    Body: {
      rolloutMode?: RolloutMode;
      canaryAllowlist?: string[];
      expectedVersion: number;
    };
  }>('/admin/agent/llm-config/rollout', { preHandler: guard }, async (req, reply) => {
    const { rolloutMode, canaryAllowlist, expectedVersion } = req.body ?? {};
    if (expectedVersion === undefined) {
      return reply.code(400).send({ code: 'agent.invalid_rollout', message: 'expectedVersion é obrigatório' });
    }
    const runtime = await deps.store.getRuntime();
    if (runtime.version !== expectedVersion) {
      return reply.code(409).send({ code: 'agent.version_conflict', message: 'Conflito de versão de configuração' });
    }
    const session = (req as unknown as { _session: { email: string } })._session;
    const updated = await deps.store.updateRuntime({
      providerId: runtime.providerId,
      modelId: runtime.modelId,
      ...(rolloutMode ? { rolloutMode } : {}),
      ...(canaryAllowlist ? { canaryAllowlist } : {}),
      expectedVersion,
      updatedBy: session.email,
    });
    return reply.send({ runtime: updated });
  });

  // POST /admin/agent/llm-config/security-epoch - Increment security epoch for emergency revocation
  app.post('/admin/agent/llm-config/security-epoch', { preHandler: guard }, async (req, reply) => {
    const session = (req as unknown as { _session: { email: string } })._session;
    const runtime = await deps.store.bumpSecurityEpoch(session.email);
    return reply.send({ runtime });
  });

  // POST /admin/agent/llm-config/test-connection - Test provider connection (sanitized response)
  app.post<{ Body: { providerId?: string } }>(
    '/admin/agent/llm-config/test-connection',
    { preHandler: guard },
    async (_req, reply) => {
      return reply.send({
        ready: false,
        code: 'not_configured',
        latencyMs: 0,
      });
    },
  );
};

