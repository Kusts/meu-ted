import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER, type DeviceTokenStore, AuthError } from '../auth/device-token.js';

export type AuthResolver = (token: string | undefined) => Promise<{ deviceId: string; householdId: string }>;

const registerInput = z.object({ deviceName: z.string().trim().min(1).max(120) });
const revokeInput = z.object({ token: z.string().trim().min(1) });

export const registerAuthRoutes = (
  app: FastifyInstance,
  opts: { resolveToken: AuthResolver; tokenStore: DeviceTokenStore },
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
    const parsed = registerInput.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const { DEMO_HOUSEHOLD_ID } = await import('../read-models/demo-data.js');
      const result = await opts.tokenStore.register(parsed.data.deviceName, DEMO_HOUSEHOLD_ID);
      return reply.code(201).send(result);
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 500).send({ code: err.code ?? 'auth.error', message: err.message ?? 'server error' });
    }
  });

  app.post('/auth/devices/revoke', async (req, reply) => {
    const parsed = revokeInput.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      await opts.tokenStore.revoke(parsed.data.token);
      return reply.code(200).send({ ok: true });
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 500).send({ code: err.code ?? 'auth.error', message: err.message ?? 'server error' });
    }
  });
};
