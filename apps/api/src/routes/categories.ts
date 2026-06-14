import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER, resolveHouseholdFromToken, type DeviceTokenStore } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';

const querySchema = z.object({
  kind: z.enum(['expense', 'income']).optional(),
});

export const registerCategoryRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; deviceTokens: DeviceTokenStore },
): void => {
  app.get('/categories', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    let ctx;
    try {
      ctx = resolveHouseholdFromToken(Array.isArray(token) ? token[0] : token, opts.deviceTokens);
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply
        .code(err.statusCode ?? 401)
        .send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    }
    let cats = await opts.store.listCategories(ctx.householdId);
    if (parsed.data.kind) {
      cats = cats.filter((c) => c.kind === parsed.data.kind);
    }
    return reply.code(200).send({ items: cats, total: cats.length });
  });
};
