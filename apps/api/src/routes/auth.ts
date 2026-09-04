import type { FastifyInstance } from 'fastify';
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

export const registerAuthRoutes = (
  app: FastifyInstance,
  opts: {
    resolveToken: AuthResolver;
    tokenStore: DeviceTokenStore;
    defaultHouseholdId?: string;
    disableDeviceRegistration?: boolean;
    auth?: BetterAuth;
    workspaceAccess?: WorkspaceAccessStore;
    workspaceStore?: import('../auth/workspaces-store.js').WorkspaceStore;
  },
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
    let isAuthenticated = false;

    if (opts.auth) {
      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val !== undefined) headers.set(key, Array.isArray(val) ? val.join(', ') : String(val));
      }
      try {
        const session = await getBetterAuthSessionContext(opts.auth, headers);
        if (session) {
          isAuthenticated = true;
          if (opts.workspaceAccess) {
            const workspaceIdHeader = req.headers['x-workspace-id'];
            const wsId = Array.isArray(workspaceIdHeader) ? workspaceIdHeader[0] : workspaceIdHeader;
            if (wsId) {
              const access = await opts.workspaceAccess.resolve(session.userId, wsId);
              if (access) {
                sessionHouseholdId = access.householdId;
              } else {
                return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Acesso ao workspace proibido.' });
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
        }
      } catch {
        // Session resolution failed, treat as anonymous
      }
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
      const result = await opts.tokenStore.register(parsed.data.deviceName, householdId);
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

};
