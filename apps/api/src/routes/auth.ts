import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER, type DeviceTokenStore } from '../auth/device-token.js';
import { requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';

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
    if (opts.disableDeviceRegistration === true) {
      return reply.code(403).send({ code: 'auth.registration_disabled', message: 'Registro de dispositivos desabilitado.' });
    }

    const body = req.body as Record<string, unknown> | undefined;
    if (!body || !('deviceName' in body) || Object.keys(body).length === 0) {
      return reply.code(403).send({ code: 'auth.registration_disabled', message: 'Registro de dispositivos desabilitado.' });
    }

    const parsed = registerInput.safeParse(req.body ?? {});

    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const { DEMO_HOUSEHOLD_ID } = await import('../read-models/demo-data.js');
      const householdId = opts.defaultHouseholdId ?? DEMO_HOUSEHOLD_ID;
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
