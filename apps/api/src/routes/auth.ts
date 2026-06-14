import type { FastifyInstance } from 'fastify';
import { DEVICE_TOKEN_HEADER, resolveHouseholdFromToken, type DeviceTokenStore } from '../auth/device-token.js';

export const registerAuthRoutes = (app: FastifyInstance, opts: { deviceTokens: DeviceTokenStore }): void => {
  app.get('/auth/devices/me', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    try {
      const ctx = resolveHouseholdFromToken(
        Array.isArray(token) ? token[0] : token,
        opts.deviceTokens,
      );
      return reply.code(200).send({
        deviceId: ctx.deviceId,
        householdId: ctx.householdId,
      });
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply
        .code(err.statusCode ?? 401)
        .send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
  });
};
