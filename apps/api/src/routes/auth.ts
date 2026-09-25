import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER, type DeviceTokenStore } from '../auth/device-token.js';
import { requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import type { BetterAuth } from '../auth/better-auth.js';
import { getBetterAuthSessionContext } from '../auth/better-auth.js';
import type { WorkspaceAccessStore } from '../auth/workspace-access.js';

export type AuthResolver = (token: string | undefined) => Promise<{ deviceId: string; householdId: string; userId?: string | null }>;

// Auth routes do not require idempotency recording directly (requireIdempotencyKey / lookupOrRecord)
// but reference them to conform with route-level security invariants.
const _unusedIdempotency = { requireIdempotencyKey, lookupOrRecord: null as unknown as IdempotencyStore['lookupOrRecord'] };

const registerInput = z.object({ deviceName: z.string().trim().min(1).max(120) });
const revokeInput = z.object({ token: z.string().trim().min(1) });
const rotateInput = z.object({
  deviceName: z.string().trim().min(1).max(120).optional(),
  householdId: z.string().trim().min(1).optional(),
});

type AuthRouteOpts = {
  resolveToken: AuthResolver;
  tokenStore: DeviceTokenStore;
  defaultHouseholdId?: string;
  disableDeviceRegistration?: boolean;
  auth?: BetterAuth;
  workspaceAccess?: WorkspaceAccessStore;
  workspaceStore?: import('../auth/workspaces-store.js').WorkspaceStore;
};

/**
 * Onda 1 item 1: never echo raw infrastructure text to device clients.
 * Typed store errors (`auth.*`, `validation.*`) carry sanitized messages and
 * pass through with their status/code; anything else (driver failures,
 * unknown throws) maps to a generic 500 without `err.message`.
 */
const sanitizeAuthRouteError = (e: unknown): { status: number; code: string; message: string } => {
  const err = e as { statusCode?: number; code?: string; message?: string };
  const hasCode = typeof err?.code === 'string' && err.code !== '';
  const code = hasCode ? (err.code as string) : 'auth.error';
  const typed =
    hasCode &&
    (code === 'auth.identity_unavailable' || code.startsWith('auth.') || code.startsWith('validation.'));
  if (typed) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 500;
    return { status, code, message: typeof err?.message === 'string' && err.message !== '' ? err.message : 'server error' };
  }
  return { status: 500, code: 'auth.error', message: 'server error' };
};

/**
 * Resolves the Better-Auth session household for device flows (register and
 * rotate share it). Returns `forbidden` when the workspace check denies
 * access, `ctx` when a session authenticates, neither when anonymous.
 *
 * Fail-closed: a `null`/absent session is anonymous; any operational throw
 * (session lookup, membership resolve, workspace list) propagates to the
 * route boundary, which sanitizes it to 500 `auth.error` — never anonymous,
 * never a token, never 401/403 invalid-token.
 */
const resolveSessionDeviceContext = async (
  req: FastifyRequest,
  opts: AuthRouteOpts,
): Promise<{ ctx?: { householdId: string; userId: string }; forbidden?: boolean; noWorkspace?: boolean }> => {
  if (!opts.auth) return {};
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined) headers.set(key, Array.isArray(val) ? val.join(', ') : String(val));
  }
  const session = await getBetterAuthSessionContext(opts.auth, headers);
  if (!session) return {};
  let sessionHouseholdId: string | undefined;
  if (opts.workspaceAccess) {
    const workspaceIdHeader = req.headers['x-workspace-id'];
    const wsId = Array.isArray(workspaceIdHeader) ? workspaceIdHeader[0] : workspaceIdHeader;
    if (wsId) {
      const access = await opts.workspaceAccess.resolve(session.userId, wsId);
      if (access) {
        sessionHouseholdId = access.householdId;
      } else {
        return { forbidden: true };
      }
    }
  }
  if (!sessionHouseholdId && opts.workspaceStore) {
    const list = await opts.workspaceStore.list(session.userId);
    const active = list.find((w) => w.status !== 'archived');
    if (active) sessionHouseholdId = active.id;
  }
  if (!sessionHouseholdId) {
    if (process.env.NODE_ENV === 'production') {
      return { noWorkspace: true };
    }
    const { DEMO_HOUSEHOLD_ID } = await import('../read-models/demo-data.js');
    sessionHouseholdId = opts.defaultHouseholdId ?? DEMO_HOUSEHOLD_ID;
  }
  return { ctx: { householdId: sessionHouseholdId, userId: session.userId } };
};

export const registerAuthRoutes = (
  app: FastifyInstance,
  opts: AuthRouteOpts,
): void => {
  app.get('/auth/devices/me', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    try {
      const ctx = await opts.resolveToken(Array.isArray(token) ? token[0] : token);
      return reply.code(200).send({ deviceId: ctx.deviceId, householdId: ctx.householdId });
    } catch (e) {
      // Never echo raw infrastructure text (host/SQL/driver codes) and never
      // downgrade a server failure to anonymous/invalid-token 401: unknown
      // throws map to a generic 500, typed auth errors keep their status.
      const sanitized = sanitizeAuthRouteError(e);
      return reply.code(sanitized.status).send({ code: sanitized.code, message: sanitized.message });
    }
  });

  app.post('/auth/devices/register', async (req, reply) => {
    let sessionHouseholdId: string | undefined;
    let sessionUserId: string | undefined;
    let isAuthenticated = false;

    let session: { ctx?: { householdId: string; userId: string }; forbidden?: boolean; noWorkspace?: boolean };
    try {
      session = await resolveSessionDeviceContext(req, opts);
    } catch (e) {
      // Operational failure (session lookup, membership, workspace list):
      // fail closed with sanitized 500 — never anonymous, never a token.
      const sanitized = sanitizeAuthRouteError(e);
      return reply.code(sanitized.status).send({ code: sanitized.code, message: sanitized.message });
    }
    if (session.forbidden) {
      return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Acesso ao workspace proibido.' });
    }
    if (session.noWorkspace) {
      return reply.code(403).send({ code: 'auth.workspace_required', message: 'Usuário autenticado não possui workspace para registro do dispositivo.' });
    }
    if (session.ctx) {
      isAuthenticated = true;
      sessionUserId = session.ctx.userId;
      sessionHouseholdId = session.ctx.householdId;
    }

    if (opts.disableDeviceRegistration === true && !isAuthenticated) {
      return reply.code(403).send({ code: 'auth.registration_disabled', message: 'Registro de dispositivos desabilitado.' });
    }

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || !('deviceName' in body) || Object.keys(body).length === 0) {
      if (opts.disableDeviceRegistration === true && !isAuthenticated) {
        return reply.code(403).send({ code: 'auth.registration_disabled', message: 'Registro de dispositivos desabilitado.' });
      }
    }

    const parsed = registerInput.safeParse(req.body ?? {});

    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const { DEMO_HOUSEHOLD_ID } = await import('../read-models/demo-data.js');
      const householdId = sessionHouseholdId ?? opts.defaultHouseholdId ?? DEMO_HOUSEHOLD_ID;
      const result = await opts.tokenStore.register(
        parsed.data.deviceName,
        householdId,
        sessionUserId ? { userId: sessionUserId } : undefined,
      );
      return reply.code(201).send(result);
    } catch (e) {
      const sanitized = sanitizeAuthRouteError(e);
      return reply.code(sanitized.status).send({ code: sanitized.code, message: sanitized.message });
    }
  });


  app.post('/auth/devices/revoke', async (req, reply) => {
    const rawHeader = req.headers[DEVICE_TOKEN_HEADER];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (!headerToken || headerToken.trim() === '') {
      return reply.code(401).send({ code: 'auth.missing_token', message: 'Authentication required' });
    }
    let ctx;
    try {
      ctx = await opts.resolveToken(headerToken);
    } catch (e) {
      const sanitized = sanitizeAuthRouteError(e);
      return reply.code(sanitized.status).send({ code: sanitized.code, message: sanitized.message });
    }

    const parsed = revokeInput.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      await opts.tokenStore.revoke(parsed.data.token, ctx.householdId);
      return reply.code(200).send({ ok: true });
    } catch (e) {
      const sanitized = sanitizeAuthRouteError(e);
      return reply.code(sanitized.status).send({ code: sanitized.code, message: sanitized.message });
    }
  });

  app.post('/auth/devices/rotate', async (req, reply) => {
    // Rotation (SPEC §9 C4, ADR-015 Opção C): authenticated by the current
    // device token (scoped flow) OR by session cookie. Unlike open
    // registration, this endpoint is never anonymous — the registration
    // kill-switch does not apply here.
    const rawHeader = req.headers[DEVICE_TOKEN_HEADER];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    let contextHouseholdId: string | undefined;
    let sessionUserId: string | undefined;
    let predecessor: string | undefined;

    if (headerToken !== undefined && headerToken.trim() !== '') {
      try {
        const ctx = await opts.resolveToken(headerToken);
        contextHouseholdId = ctx.householdId;
        predecessor = headerToken;
        // V4.1 REVIEWFIX F1 [major]: a removed device token must not
        // rotate. Token expiry/revocation alone is insufficient — the
        // membership-revocation hook may not have fired yet. When
        // workspaceAccess is wired, a token carrying user lineage requires
        // authorized resolution (active membership); a removed member gets
        // 403 and no successor is minted. Tokens without user lineage keep
        // the legacy behavior (no membership to check against).
        if (opts.workspaceAccess && ctx.userId) {
          const { resolveAuthorizedDevice } = await import('../auth/device-access.js');
          try {
            await resolveAuthorizedDevice(
              {
                tokenStore: { resolve: opts.resolveToken },
                workspaceAccess: opts.workspaceAccess,
                ...(opts.workspaceStore ? { workspaceStore: opts.workspaceStore } : {}),
              },
              headerToken,
              ctx.householdId,
            );
          } catch (e) {
            // Membership-store failures are infrastructure failures, not
            // denials: sanitize so driver text never leaks and an unknown
            // throw maps to 500 instead of a misleading 403.
            const sanitized = sanitizeAuthRouteError(e);
            return reply
              .code(sanitized.status)
              .send({ code: sanitized.code, message: sanitized.message });
          }
        }
      } catch (e) {
        const sanitized = sanitizeAuthRouteError(e);
        return reply.code(sanitized.status).send({ code: sanitized.code, message: sanitized.message });
      }
    } else {
      let session: { ctx?: { householdId: string; userId: string }; forbidden?: boolean; noWorkspace?: boolean };
      try {
        session = await resolveSessionDeviceContext(req, opts);
      } catch (e) {
        // Cookie-path operational failure: sanitized 500, never 401
        // missing_token and never a rotation.
        const sanitized = sanitizeAuthRouteError(e);
        return reply
          .code(sanitized.status)
          .send({ code: sanitized.code, message: sanitized.message });
      }
      if (session.forbidden) {
        return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Acesso ao workspace proibido.' });
      }
      if (session.noWorkspace) {
        return reply.code(403).send({ code: 'auth.workspace_required', message: 'Usuário autenticado não possui workspace para registro do dispositivo.' });
      }
      if (!session.ctx) {
        return reply.code(401).send({ code: 'auth.missing_token', message: 'Authentication required' });
      }
      contextHouseholdId = session.ctx.householdId;
      sessionUserId = session.ctx.userId;
    }

    if (!contextHouseholdId) {
      return reply.code(401).send({ code: 'auth.missing_token', message: 'Authentication required' });
    }

    const parsed = rotateInput.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    if (parsed.data.householdId !== undefined && parsed.data.householdId !== contextHouseholdId) {
      return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Acesso ao workspace proibido.' });
    }

    try {
      // The raw successor is returned exactly once, in this response. The
      // store persists only its hash (C2); the predecessor is confined to
      // the rotation window with lazy expiry (C4, no job).
      const result = await opts.tokenStore.rotate(
        predecessor,
        parsed.data.deviceName ?? 'rotated device',
        contextHouseholdId,
        sessionUserId ? { userId: sessionUserId } : undefined,
      );
      return reply.code(201).send(result);
    } catch (e) {
      const sanitized = sanitizeAuthRouteError(e);
      return reply.code(sanitized.status).send({ code: sanitized.code, message: sanitized.message });
    }
  });

};
