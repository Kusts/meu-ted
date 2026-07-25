import type { FastifyInstance } from 'fastify';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import { buildDashboardSummary } from '../lib/dashboard.js';
import type { AuthResolver } from './auth.js';

export const registerDashboardRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; resolveToken: AuthResolver },
): void => {
  app.get('/dashboard/summary', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    let ctx;
    try { ctx = await opts.resolveToken(Array.isArray(token) ? token[0] : token); }
    catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
    const [accounts, categories, transactions] = await Promise.all([
      opts.store.listAccounts(ctx.householdId),
      opts.store.listCategories(ctx.householdId),
      opts.store.listAllTransactions(ctx.householdId),
    ]);
    return reply.code(200).send(buildDashboardSummary(ctx.householdId, accounts, categories, transactions));
  });
};
