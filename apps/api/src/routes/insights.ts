import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import { buildDashboardSummary } from '../lib/dashboard.js';
import { buildQuickInsights } from '../lib/insights.js';
import type { AuthResolver } from './auth.js';

export const spendingInsightQuerySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  insightType: z.enum(['all', 'comparison', 'anomalies', 'income-share']).optional(),
  lookbackMonths: z.coerce.number().int().min(1).max(12).optional(),
});

export const registerInsightRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; resolveToken: AuthResolver },
): void => {
  app.get('/insights/quick', async (req, reply) => {
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
    return reply.code(200).send({ items: buildQuickInsights(buildDashboardSummary(ctx.householdId, accounts, categories, transactions)) });
  });

  app.get('/insights/spending', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    let ctx;
    try { ctx = await opts.resolveToken(Array.isArray(token) ? token[0] : token); }
    catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
    const parsed = spendingInsightQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    }
    const transactions = await opts.store.listAllTransactions(ctx.householdId);
    return reply.code(200).send({
      success: true,
      yearMonth: parsed.data.yearMonth ?? new Date().toISOString().slice(0, 7),
      insights: [],
      transactionCount: transactions.length,
    });
  });
};

