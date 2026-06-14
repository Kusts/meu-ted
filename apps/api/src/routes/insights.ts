import type { FastifyInstance } from 'fastify';
import { DEVICE_TOKEN_HEADER, resolveHouseholdFromToken, type DeviceTokenStore } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import { buildDashboardSummary } from '../lib/dashboard.js';
import { buildQuickInsights } from '../lib/insights.js';

export const registerInsightRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; deviceTokens: DeviceTokenStore },
): void => {
  app.get('/insights/quick', async (req, reply) => {
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
    const [accounts, categories, transactions] = await Promise.all([
      opts.store.listAccounts(ctx.householdId),
      opts.store.listCategories(ctx.householdId),
      opts.store.listAllTransactions(ctx.householdId),
    ]);
    const summary = buildDashboardSummary(ctx.householdId, accounts, categories, transactions);
    const items = buildQuickInsights(summary);
    return reply.code(200).send({ items });
  });
};
