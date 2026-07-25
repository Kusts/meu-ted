import type { FastifyInstance } from 'fastify';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import { transactionFiltersSchema } from '../types/transactions.js';
import type { AuthResolver } from './auth.js';

export const registerTransactionRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; resolveToken: AuthResolver },
): void => {
  app.get('/transactions', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    let ctx;
    try { ctx = await opts.resolveToken(Array.isArray(token) ? token[0] : token); }
    catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
    const parsed = transactionFiltersSchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const { items, total } = await opts.store.listTransactions(ctx.householdId, parsed.data);
    return reply.code(200).send({ items, total, limit: parsed.data.limit, offset: parsed.data.offset });
  });
};
