import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getBetterAuthSessionContext, type BetterAuth } from '../auth/better-auth.js';
import { isUserAdmin } from '../auth/admin-invite-service.js';
import type { LlmConfigStore } from '../agent/llm-config-store.js';
import { toAdminRuntimeDto } from '../agent/runtime-mapper.js';
import {
  activateSchema,
  createModelSchema,
  createProviderSchema,
  fallbackSchema,
  patchProviderSchema,
  rolloutSchema,
  securityEpochSchema,
  syncCatalogSchema,
  testConnectionSchema,
  toggleEnabledSchema,
} from '@pi-finance/llm-contracts';
import { canActivate, isKindExecutable, validateModel, type PrivacyClass, type Protocol } from '../agent/llm-config.js';

const invalidBody = (
  reply: FastifyReply,
  code: 'agent.invalid_provider' | 'agent.invalid_model' | 'agent.invalid_activate' | 'agent.invalid_rollout' | 'agent.invalid_fallback' | 'agent.invalid_parameters',
  reason: string,
) => reply.code(400).send({ code, message: reason, reason });

const kindUnsupported = (reply: FastifyReply, kind: string) =>
  reply.code(422).send({
    code: 'agent.kind_unsupported',
    message: `provider kind ${kind} is not executable by the agent runtime`,
    reason: `provider kind ${kind} is not executable by the agent runtime`,
  });

/** Maps store write errors (version conflict, revalidation, upsert guards) to HTTP. */
const mapRuntimeWriteError = (reply: FastifyReply, err: unknown) => {
  const e = err as { statusCode?: number; code?: string; reason?: string; message?: string };
  if (
    (e?.code === 'agent.activation_blocked' ||
      e?.code === 'agent.version_conflict' ||
      e?.code === 'agent.runtime_in_use' ||
      e?.code === 'agent.kind_unsupported' ||
      e?.code === 'agent.invalid_provider' ||
      e?.code === 'agent.invalid_model') &&
    typeof e?.statusCode === 'number'
  ) {
    const body: Record<string, unknown> = { code: e.code };
    if (e.reason !== undefined) body['reason'] = e.reason;
    if (e.message) body['message'] = e.message;
    return reply.code(e.statusCode).send(body);
  }
  throw err;
};

export interface AdminAgentLlmConfigDeps {
  auth: BetterAuth;
  store: LlmConfigStore;
  adminEmails: string[];
  agentRuntimeOrigin: string;
  agentRuntimeToken: string;
  trustedOrigins?: string[];
  /**
   * Fase 3 item 9: best-effort audit sink for sensitive admin reads. Never
   * throws into the request path; carries only operational metadata (actor,
   * versions, counts) — never secrets, aliases, or full configuration.
   */
  auditLog?: (event: AdminLlmReadAudit) => void;
}

/** Operational metadata recorded for each sensitive admin config read. */
export interface AdminLlmReadAudit {
  action: 'admin.llm-config.read';
  actor: string;
  version: number;
  securityEpoch: number;
  providerCount: number;
  modelCount: number;
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

    // Order is deliberate (Fase 3-FIX D4-rev): session first, so
    // unauthenticated callers always get 401 (the auth inventory pins
    // this); then admin, then the mutation-only CSRF/SSRF checks. A forged
    // cross-site request always carries a valid session to reach the CSRF
    // check, which still rejects it — no bypass, only clearer codes.
    let session: { userId: string; email: string } | null | undefined = null;
    try {
      session = await getBetterAuthSessionContext(deps.auth, headers);
    } catch {
      // Ignore session retrieval errors
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

    // CSRF check for mutations (Fase 3 D4, hardened Fase 3-FIX D4-rev): the
    // Origin/Referer allowlist protects cookie-session callers only. A
    // request carrying an explicit `Authorization: Bearer ...` header cannot
    // be forged by a simple cross-site request (custom headers trigger a
    // CORS preflight the attacker cannot satisfy), so Bearer callers skip
    // this check — they already passed session/admin auth above.
    // Cookie-session mutations MUST present a trusted Origin (or, when no
    // Origin is sent, a trusted Referer); an absent attestation is rejected
    // fail-closed instead of treated as "no evidence of forgery".
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const authHeader = req.headers['authorization'];
      const hasBearer = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ');
      if (!hasBearer) {
        const origin = req.headers['origin'] || headers.get('origin');
        const isTrustedOrigin =
          typeof origin === 'string' && trustedOrigins.has(origin.toLowerCase().trim());
        let isTrustedReferer = false;
        if (!isTrustedOrigin) {
          const referer = req.headers['referer'] || headers.get('referer');
          if (typeof referer === 'string') {
            try {
              isTrustedReferer = trustedOrigins.has(new URL(referer).origin.toLowerCase());
            } catch {
              isTrustedReferer = false;
            }
          }
        }
        if (!isTrustedOrigin && !isTrustedReferer) {
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

    (req as unknown as Record<string, unknown>)['_session'] = session;
  };

  // GET /admin/agent/llm-config - List full config (providers, models, runtime DTO)
  app.get('/admin/agent/llm-config', { preHandler: guard }, async (req) => {
    const [providers, models, runtime] = await Promise.all([
      deps.store.listProviders(),
      deps.store.listModels(),
      deps.store.getRuntime(),
    ]);
    // Fase 3 item 9: audit the sensitive read best-effort — a failing sink
    // must never break configuration reads.
    if (deps.auditLog) {
      try {
        const session = (req as unknown as { _session?: { email?: string } })._session;
        deps.auditLog({
          action: 'admin.llm-config.read',
          actor: session?.email ?? 'unknown',
          version: runtime.version,
          securityEpoch: runtime.securityEpoch,
          providerCount: providers.length,
          modelCount: models.length,
        });
      } catch {
        // Audit sink failure is never a read failure.
      }
    }
    return { providers, models, runtime: toAdminRuntimeDto(runtime, models) };
  });

  // POST /admin/agent/llm-config/sync-catalog - Sync model catalogue
  app.post('/admin/agent/llm-config/sync-catalog', { preHandler: guard }, async (req, reply) => {
    const parsed = syncCatalogSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'invalid sync catalog payload';
      return invalidBody(reply, 'agent.invalid_model', reason);
    }
    const { items } = parsed.data;
    let synced = 0;

    if (items.length > 0) {
      for (const item of items) {
        // Fase 3-FIX R1: resolve the kind before validating. An unknown
        // provider fails the whole batch fast with a clear error (a bulk
        // import must never silently create orphan models); semantic
        // conflicts of known providers keep the Fase 2 item 6 skip policy.
        const provider = await deps.store.getProvider(item.providerId);
        if (!provider) {
          return reply.code(404).send({
            code: 'agent.provider_not_found',
            message: `Provider ${item.providerId} não encontrado`,
          });
        }
        const err = validateModel(
          {
            providerId: item.providerId,
            modelId: item.modelId,
            protocol: item.protocol ?? 'chat-completions',
            privacyClass: item.privacyClass ?? 'training_prohibited',
          },
          provider.kind,
        );
        if (!err) {
          try {
            await deps.store.upsertModel({
              providerId: item.providerId,
              modelId: item.modelId,
              protocol: item.protocol ?? 'chat-completions',
              privacyClass: item.privacyClass ?? 'training_prohibited',
              retention: item.retention ?? null,
              enabled: false,
            });
            synced++;
          } catch (upsertErr) {
            // Fase 2 item 6: a conflicting catalog entry (e.g. metadata of a
            // referenced model) is skipped, never applied half-way.
            const e = upsertErr as { statusCode?: number; code?: string };
            if (
              typeof e?.statusCode === 'number' &&
              (e?.code === 'agent.runtime_in_use' ||
                e?.code === 'agent.invalid_model' ||
                e?.code === 'agent.invalid_provider' ||
                e?.code === 'agent.kind_unsupported' ||
                e?.code === 'agent.activation_blocked')
            ) {
              continue;
            }
            throw upsertErr;
          }
        }
      }
    }

    return reply.send({ ok: true, synced });
  });

  // POST /admin/agent/llm-config/providers/:id/toggle - Toggle provider enabled state
  app.post<{ Params: { id: string } }>(
    '/admin/agent/llm-config/providers/:id/toggle',
    { preHandler: guard },
    async (req, reply) => {
      const { id } = req.params;
      const parsed = toggleEnabledSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const reason = parsed.error.issues[0]?.message ?? 'enabled must be boolean';
        return reply.code(400).send({ code: 'agent.invalid_enabled', message: reason, reason });
      }
      const { enabled } = parsed.data;
      try {
        const provider = await deps.store.setProviderEnabled(id, enabled);
        const [models, runtime] = await Promise.all([deps.store.listModels(), deps.store.getRuntime()]);
        return reply.send({ provider, runtime: toAdminRuntimeDto(runtime, models) });
      } catch (err) {
        const e = err as { code?: string; reason?: string; statusCode?: number; message?: string };
        if (e?.code === 'agent.runtime_in_use' && e?.statusCode === 409) {
          return reply.code(409).send({ code: e.code, reason: e.reason ?? 'runtime_in_use' });
        }
        throw err;
      }
    },
  );

  // POST /admin/agent/llm-config/models/:id/toggle - Toggle model enabled state
  app.post<{ Params: { id: string } }>(
    '/admin/agent/llm-config/models/:id/toggle',
    { preHandler: guard },
    async (req, reply) => {
      const { id } = req.params;
      const parsed = toggleEnabledSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const reason = parsed.error.issues[0]?.message ?? 'enabled must be boolean';
        return reply.code(400).send({ code: 'agent.invalid_enabled', message: reason, reason });
      }
      const { enabled } = parsed.data;
      try {
        const model = await deps.store.setModelEnabled(id, enabled);
        const [models, runtime] = await Promise.all([deps.store.listModels(), deps.store.getRuntime()]);
        return reply.send({ model, runtime: toAdminRuntimeDto(runtime, models) });
      } catch (err) {
        const e = err as { code?: string; reason?: string; statusCode?: number };
        if (e?.code === 'agent.runtime_in_use' && e?.statusCode === 409) {
          return reply.code(409).send({ code: e.code, reason: e.reason ?? 'runtime_in_use' });
        }
        throw err;
      }
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
    const parsed = createModelSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'invalid model';
      return invalidBody(reply, 'agent.invalid_model', reason);
    }
    const body = parsed.data;
    // Fase 3-FIX R1: resolve the provider kind BEFORE validating — an
    // unknown provider is a clear 404, and compatibility is judged against
    // the real kind, never a flat protocol list.
    const provider = await deps.store.getProvider(body.providerId);
    if (!provider) {
      return reply.code(404).send({ code: 'agent.provider_not_found', message: `Provider ${body.providerId} não encontrado` });
    }
    const err = validateModel(
      {
        providerId: body.providerId,
        modelId: body.modelId,
        protocol: body.protocol,
        privacyClass: body.privacyClass,
      },
      provider.kind,
    );
    if (err) {
      return invalidBody(reply, 'agent.invalid_model', err);
    }
    try {
      const model = await deps.store.upsertModel({
        providerId: body.providerId,
        modelId: body.modelId,
        protocol: body.protocol,
        privacyClass: body.privacyClass,
        retention: body.retention ?? null,
        enabled: body.enabled ?? false,
      });
      return reply.code(201).send({ model });
    } catch (err) {
      return mapRuntimeWriteError(reply, err);
    }
  });

  // POST /admin/agent/llm-config/activate - Activate an approved provider/model pair
  app.post('/admin/agent/llm-config/activate', { preHandler: guard }, async (req, reply) => {
    const parsed = activateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'invalid activate payload';
      return invalidBody(reply, 'agent.invalid_activate', reason);
    }
    const { providerId, modelId, rolloutMode, expectedVersion } = parsed.data;

    const provider = await deps.store.getProvider(providerId);
    const models = await deps.store.listModels();
    const model = models.find((m) => m.id === modelId || (m.providerId === providerId && m.modelId === modelId));

    if (model && model.providerId !== providerId) {
      return reply.code(422).send({ code: 'agent.activation_blocked', reason: 'model does not belong to provider' });
    }

    const err = canActivate(provider, model);
    if (err) {
      return reply.code(422).send({ code: 'agent.activation_blocked', reason: err });
    }

    const session = (req as unknown as { _session: { email: string } })._session;
    try {
      const runtime = await deps.store.updateRuntime({
        providerId,
        modelId: model!.id,
        rolloutMode: rolloutMode ?? 'disabled',
        expectedVersion,
        updatedBy: session.email,
      });
      return reply.send({ runtime: toAdminRuntimeDto(runtime, models) });
    } catch (err) {
      return mapRuntimeWriteError(reply, err);
    }
  });

  // POST /admin/agent/llm-config/rollout - Change rollout mode or canary allowlist
  app.post('/admin/agent/llm-config/rollout', { preHandler: guard }, async (req, reply) => {
    const parsed = rolloutSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'invalid rollout payload';
      return invalidBody(reply, 'agent.invalid_rollout', reason);
    }
    const { rolloutMode, canaryAllowlist, expectedVersion } = parsed.data;
    const runtime = await deps.store.getRuntime();
    if (runtime.version !== expectedVersion) {
      return reply.code(409).send({ code: 'agent.version_conflict', message: 'Conflito de versão de configuração' });
    }
    const session = (req as unknown as { _session: { email: string } })._session;
    try {
      const updated = await deps.store.updateRuntime({
        providerId: runtime.providerId,
        modelId: runtime.modelId,
        ...(rolloutMode ? { rolloutMode } : {}),
        ...(canaryAllowlist ? { canaryAllowlist } : {}),
        expectedVersion,
        updatedBy: session.email,
      });
      const models = await deps.store.listModels();
      return reply.send({ runtime: toAdminRuntimeDto(updated, models) });
    } catch (err) {
      return mapRuntimeWriteError(reply, err);
    }
  });

  // POST /admin/agent/llm-config/security-epoch - Increment security epoch for emergency revocation
  app.post('/admin/agent/llm-config/security-epoch', { preHandler: guard }, async (req, reply) => {
    const parsed = securityEpochSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'security-epoch takes no parameters';
      return invalidBody(reply, 'agent.invalid_parameters', reason);
    }
    const session = (req as unknown as { _session: { email: string } })._session;
    const runtime = await deps.store.bumpSecurityEpoch(session.email);
    const models = await deps.store.listModels();
    return reply.send({ runtime: toAdminRuntimeDto(runtime, models) });
  });

  // POST /admin/agent/llm-config/providers - Create / upsert provider (CRUD)
  app.post<{
    Body: { id: string; kind?: string; transport?: string; authMode?: string; secretAlias?: string | null; name?: string; baseUrl?: string; eligibility?: string; enabled?: boolean };
  }>('/admin/agent/llm-config/providers', { preHandler: guard }, async (req, reply) => {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const id = String(raw['id'] ?? raw['name'] ?? '').trim();
    if (!id) return invalidBody(reply, 'agent.invalid_provider', 'id é obrigatório');
    let kind = raw['kind'] as string | undefined;
    let transport = raw['transport'] as string | undefined;
    let authMode = raw['authMode'] as string | undefined;
    let secretAlias = raw['secretAlias'] as string | null | undefined;
    if (!kind && typeof raw['name'] === 'string') {
      const map: Record<string, string> = { 'opencode-zen': 'opencode-zen', 'opencode-go': 'opencode-go', 'openai-api': 'openai-api', 'openai-codex-subscription': 'openai-codex-subscription' };
      kind = map[id] ?? map[raw['name']] ?? 'openai-api';
    }
    if (!transport) transport = kind === 'openai-codex-subscription' ? 'private-broker' : 'direct';
    if (!authMode) authMode = transport === 'private-broker' ? 'chatgpt-browser' : 'api-key';
    if (secretAlias === undefined) {
      const aliasMap: Record<string, string | null> = { 'opencode-zen': 'OPENCODE_ZEN_API_KEY', 'opencode-go': 'OPENCODE_GO_API_KEY', 'openai-api': 'OPENAI_API_KEY', 'openai-codex-subscription': null };
      secretAlias = (aliasMap[kind ?? 'openai-api'] as string | null) ?? null;
    }
    const parsed = createProviderSchema.safeParse({
      id,
      kind,
      transport,
      authMode,
      secretAlias,
      ...(typeof raw['name'] === 'string' ? { name: raw['name'] } : {}),
      ...(typeof raw['eligibility'] === 'string' ? { eligibility: raw['eligibility'] } : {}),
      ...(typeof raw['enabled'] === 'boolean' ? { enabled: raw['enabled'] } : {}),
    });
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'invalid provider';
      return invalidBody(reply, 'agent.invalid_provider', reason);
    }
    // Fase 1b-FIX item 3: unsupported kinds are never releasable via create.
    if (!isKindExecutable(parsed.data.kind)) {
      return kindUnsupported(reply, parsed.data.kind);
    }
    const { validateProvider } = await import('../agent/llm-config.js');
    const errs = validateProvider({
      kind: parsed.data.kind,
      transport: parsed.data.transport,
      authMode: parsed.data.authMode,
      secretAlias: parsed.data.secretAlias,
    });
    if (errs) return invalidBody(reply, 'agent.invalid_provider', errs);
    try {
      const provider = await deps.store.upsertProvider({
        id: parsed.data.id,
        kind: parsed.data.kind,
        transport: parsed.data.transport,
        authMode: parsed.data.authMode,
        secretAlias: parsed.data.secretAlias,
        enabled: parsed.data.enabled ?? false,
        eligibility: parsed.data.eligibility ?? 'approved',
      });
      return reply.code(201).send({ provider });
    } catch (err) {
      return mapRuntimeWriteError(reply, err);
    }
  });

  app.patch<{ Params: { id: string } }>('/admin/agent/llm-config/providers/:id', { preHandler: guard }, async (req, reply) => {
    const { id } = req.params;
    const parsed = patchProviderSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'invalid provider patch';
      return invalidBody(reply, 'agent.invalid_provider', reason);
    }
    const patch = parsed.data;
    const existing = await deps.store.getProvider(id);
    if (!existing) return reply.code(404).send({ code: 'agent.provider_not_found', message: `Provider ${id} não encontrado` });
    // Fase 1b-FIX item 3: an unsupported kind can never be promoted to usable.
    // Demotions (enabled:false, non-approved eligibility) stay allowed.
    if (!isKindExecutable(existing.kind) && (patch.enabled === true || patch.eligibility === 'approved')) {
      return kindUnsupported(reply, existing.kind);
    }
    const merged = {
      ...existing,
      enabled: patch.enabled ?? existing.enabled,
      eligibility: patch.eligibility ?? existing.eligibility,
      secretAlias: patch.secretAlias !== undefined ? patch.secretAlias : existing.secretAlias,
    };
    const { validateProvider } = await import('../agent/llm-config.js');
    const err = validateProvider(merged);
    if (err) return invalidBody(reply, 'agent.invalid_provider', err);
    // Fase 1b-FIX item 1: `enabled` flips go through the guarded toggle
    // path (upsert preserves `enabled` on conflict by design).
    if (patch.enabled !== undefined && patch.enabled !== existing.enabled) {
      try {
        await deps.store.setProviderEnabled(id, patch.enabled);
      } catch (toggleErr) {
        const e = toggleErr as { code?: string; reason?: string; statusCode?: number };
        if (e?.code === 'agent.runtime_in_use' && e?.statusCode === 409) {
          return reply.code(409).send({ code: e.code, reason: e.reason ?? 'runtime_in_use' });
        }
        throw toggleErr;
      }
    }
    try {
      const provider = await deps.store.upsertProvider({
        id: existing.id,
        kind: existing.kind,
        transport: existing.transport,
        authMode: existing.authMode,
        secretAlias: merged.secretAlias,
        enabled: merged.enabled,
        eligibility: merged.eligibility,
      });
      return reply.send({ provider });
    } catch (err) {
      return mapRuntimeWriteError(reply, err);
    }
  });

  app.delete<{ Params: { id: string } }>('/admin/agent/llm-config/providers/:id', { preHandler: guard }, async (req, reply) => {
    const { id } = req.params;
    const existing = await deps.store.getProvider(id);
    if (!existing) return reply.code(404).send({ code: 'agent.provider_not_found', message: `Provider ${id} não encontrado` });
    try {
      await deps.store.deleteProvider(id);
    } catch (err) {
      const e = err as { code?: string; reason?: string; statusCode?: number };
      if (e?.code === 'agent.runtime_in_use' && e?.statusCode === 409) {
        return reply.code(409).send({ code: e.code, reason: e.reason ?? 'runtime_in_use' });
      }
      if ((e as { code?: string })?.code === '23503') {
        return reply.code(409).send({ code: 'agent.runtime_in_use', reason: 'active_provider' });
      }
      throw err;
    }
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { id: string } }>('/admin/agent/llm-config/models/:id', { preHandler: guard }, async (req, reply) => {
    const { id } = req.params;
    try {
      await deps.store.deleteModel(id);
    } catch (err) {
      const e = err as { code?: string; reason?: string; statusCode?: number };
      if (e?.code === 'agent.runtime_in_use' && e?.statusCode === 409) {
        return reply.code(409).send({ code: e.code, reason: e.reason ?? 'runtime_in_use' });
      }
      // V042 model FKs (active and fallback) reject bypass deletes with 23503.
      if ((e as { code?: string })?.code === '23503') {
        return reply.code(409).send({ code: 'agent.runtime_in_use', reason: 'runtime_in_use' });
      }
      throw err;
    }
    return reply.send({ ok: true });
  });

  // POST /admin/agent/llm-config/fallback - Set fallback provider/model
  app.post('/admin/agent/llm-config/fallback', { preHandler: guard }, async (req, reply) => {
    const parsed = fallbackSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'invalid fallback payload';
      return invalidBody(reply, 'agent.invalid_fallback', reason);
    }
    const { providerId, modelId, expectedVersion } = parsed.data;
    if (providerId && modelId) {
      const provider = await deps.store.getProvider(providerId);
      const models = await deps.store.listModels();
      const model = models.find((m) => m.id === modelId || (m.providerId === providerId && m.modelId === modelId));
      if (model && model.providerId !== providerId) {
        return reply.code(422).send({ code: 'agent.activation_blocked', reason: 'model does not belong to provider' });
      }
      const { canActivate } = await import('../agent/llm-config.js');
      const err = canActivate(provider, model);
      if (err) return reply.code(422).send({ code: 'agent.activation_blocked', reason: err });
    }
    const runtime = await deps.store.getRuntime();
    if (runtime.version !== expectedVersion) {
      return reply.code(409).send({ code: 'agent.version_conflict', message: 'Conflito de versão' });
    }
    const session = (req as unknown as { _session: { email: string } })._session;
    let fallbackModelId: string | null = modelId;
    if (providerId && modelId) {
      const models = await deps.store.listModels();
      const found = models.find((m) => m.id === modelId || (m.providerId === providerId && m.modelId === modelId));
      fallbackModelId = found ? found.id : modelId;
    }
    try {
      const updated = await deps.store.updateRuntime({
        providerId: runtime.providerId,
        modelId: runtime.modelId,
        fallbackProviderId: providerId,
        fallbackModelId: fallbackModelId,
        expectedVersion,
        updatedBy: session.email,
      });
      const modelsAfter = await deps.store.listModels();
      return reply.send({ ok: true, runtime: toAdminRuntimeDto(updated, modelsAfter) });
    } catch (err) {
      return mapRuntimeWriteError(reply, err);
    }
  });

  // POST /admin/agent/llm-config/test-connection - Test provider connection (sanitized response)
  // EXPLICIT STUB (Fase 1b-FIX item 8): this endpoint intentionally does not
  // probe any provider yet — it validates the body shape and always answers
  // not_configured without touching secrets or the network. A live probe
  // would reuse provider-probe semantics through the agent runtime.
  app.post(
    '/admin/agent/llm-config/test-connection',
    { preHandler: guard },
    async (req, reply) => {
      const parsed = testConnectionSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const reason = parsed.error.issues[0]?.message ?? 'invalid test-connection payload';
        return invalidBody(reply, 'agent.invalid_parameters', reason);
      }
      return reply.send({
        ready: false,
        code: 'not_configured',
        latencyMs: 0,
      });
    },
  );
};

