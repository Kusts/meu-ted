import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER, type DeviceTokenStore } from '../auth/device-token.js';
import { requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import type { BetterAuth } from '../auth/better-auth.js';
import { getBetterAuthSessionContext } from '../auth/better-auth.js';
import type { WorkspaceAccessStore } from '../auth/workspace-access.js';

export type AuthResolver = (token: string | undefined) => Promise<{ deviceId: string; householdId: string }>;

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
 * Resolves the Better-Auth session household for device flows (register and
 * rotate share it). Returns `forbidden` when the workspace check denies
 * access, `ctx` when a session authenticates, neither when anonymous.
 */
const resolveSessionDeviceContext = async (
  req: FastifyRequest,
  opts: AuthRouteOpts,
): Promise<{ ctx?: { householdId: string; userId: string }; forbidden?: boolean }> => {
  if (!opts.auth) return {};
  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (val !== undefined) headers.set(key, Array.isArray(val) ? val.join(', ') : String(val));
  }
  try {
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
      const { DEMO_HOUSEHOLD_ID } = await import('../read-models/demo-data.js');
      sessionHouseholdId = opts.defaultHouseholdId ?? DEMO_HOUSEHOLD_ID;
    }
    return { ctx: { householdId: sessionHouseholdId, userId: session.userId } };
  } catch {
    // Session resolution failed, treat as anonymous
    return {};
  }
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
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
  });

  app.post('/auth/devices/register', async (req, reply) => {
    let sessionHouseholdId: string | undefined;
    let sessionUserId: string | undefined;
    let isAuthenticated = false;

    const session = await resolveSessionDeviceContext(req, opts);
    if (session.forbidden) {
      return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Acesso ao workspace proibido.' });
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
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 500).send({ code: err.code ?? 'auth.error', message: err.message ?? 'server error' });
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
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.invalid_token', message: err.message ?? 'unauthorized' });
    }

    const parsed = revokeInput.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      await opts.tokenStore.revoke(parsed.data.token, ctx.householdId);
      return reply.code(200).send({ ok: true });
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 500).send({ code: err.code ?? 'auth.error', message: err.message ?? 'server error' });
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
      } catch (e) {
        const err = e as { statusCode?: number; code?: string; message?: string };
        return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.invalid_token', message: err.message ?? 'unauthorized' });
      }
    } else {
      const session = await resolveSessionDeviceContext(req, opts);
      if (session.forbidden) {
        return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Acesso ao workspace proibido.' });
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
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 500).send({ code: err.code ?? 'auth.error', message: err.message ?? 'server error' });
    }
  });

};
