import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ReadModelStore } from '../read-models/store.js';
import { buildDashboardSummary } from '../lib/dashboard.js';
import type { AuthResolver } from './auth.js';

export const monthSummaryQuerySchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});
const monthSummaryQuery = monthSummaryQuerySchema;

export const registerDashboardRoutes = (
  app: FastifyInstance,
  opts: { store: ReadModelStore; resolveToken: AuthResolver; clock?: () => Date },
): void => {
  app.get('/dashboard/month-summary', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    let ctx;
    try { ctx = await opts.resolveToken(Array.isArray(token) ? token[0] : token); }
    catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
    const parsed = monthSummaryQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });

    const year = Number(parsed.data.yearMonth.slice(0, 4));
    const month = Number(parsed.data.yearMonth.slice(5, 7));
    const start = `${parsed.data.yearMonth}-01`;
    const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const transactions = (await opts.store.listAllTransactions(ctx.householdId))
      .filter((transaction) => transaction.date >= start && transaction.date < nextMonth);
    const incomeCents = transactions
      .filter((transaction) => transaction.kind === 'income')
      .reduce((total, transaction) => total + transaction.amountCents, 0);
    const expenseCents = transactions
      .filter((transaction) => transaction.kind === 'expense')
      .reduce((total, transaction) => total + transaction.amountCents, 0);

    return reply.code(200).send({
      yearMonth: parsed.data.yearMonth,
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
      transactionCount: transactions.length,
    });
  });

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
    return reply.code(200).send(buildDashboardSummary(ctx.householdId, accounts, categories, transactions, opts.clock ? opts.clock() : new Date()));
  });
};
