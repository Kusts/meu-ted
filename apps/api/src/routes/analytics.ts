/**
 * Analytics read endpoints (item 14, etapa A). All GET, workspace-scoped
 * via device token, household derived server-side. Optional ?period=
 * (last30days|lastMonth|thisYear|custom), ?from/?to= for custom,
 * ?accountId= to scope, ?kind= for the category breakdown.
 */

import type { FastifyInstance } from 'fastify';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { AuthResolver } from './auth.js';
import type { AnalyticsSource } from '../analytics/source.js';
import {
  addDays,
  buildBudgetConsumption,
  buildCashflowSeries,
  buildCategoryBreakdown,
  buildDailyHeatmap,
  buildNetWorthHistory,
  normalizeMonthly,
  previousRangeOf,
  resolveRange,
  savingsRatePct,
  statementRemaining,
  statementsDueSoon,
  isOpenStatement,
  toISODate,
} from '../analytics/compute.js';
import { analyticsQuerySchema, categoryBreakdownQuerySchema } from '../analytics/types.js';

export type AnalyticsRouteDeps = {
  source: AnalyticsSource;
  resolveToken: AuthResolver;
  clock?: () => Date;
};

export const DUE_SOON_DAYS = 3;
export const SAVINGS_TARGET_PCT = 20;
export const NET_WORTH_MONTHS = 12;

export const registerAnalyticsRoutes = (app: FastifyInstance, opts: AnalyticsRouteDeps): void => {
  const resolve = async (req: import('fastify').FastifyRequest) => {
    if (req.authenticatedContext) return req.authenticatedContext;
    const token = req.headers[DEVICE_TOKEN_HEADER];
    return opts.resolveToken(Array.isArray(token) ? token[0] : token);
  };
  const handleError = (err: unknown, reply: import('fastify').FastifyReply) => {
    if ((err as { statusCode?: number }).statusCode) {
      const e = err as { statusCode: number; code: string; message: string };
      return reply.code(e.statusCode).send({ code: e.code, message: e.message });
    }
    throw err;
  };
  const today = () => toISODate(opts.clock ? opts.clock() : new Date());

  app.get('/analytics/kpis', async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = analyticsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const range = resolveRange(parsed.data.period, today(), parsed.data.from, parsed.data.to);
      const previous = previousRangeOf(range);
      const accountId = parsed.data.accountId;
      const [lists, now, before] = await Promise.all([
        opts.source.loadLists(ctx.householdId),
        opts.source.sumByKind(ctx.householdId, range.from, range.to, accountId),
        opts.source.sumByKind(ctx.householdId, previous.from, previous.to, accountId),
      ]);
      const inScopeAccount = (id: string): boolean => !accountId || id === accountId;
      const accountsTotalCents = lists.bankAccounts
        .filter((account) => inScopeAccount(account.id))
        .reduce((sum, account) => sum + account.balanceCents, 0);
      const openStatements = lists.statements.filter((s) => isOpenStatement(s) && inScopeAccount(s.accountId));
      const dueSoonCents = statementsDueSoon(openStatements, today(), DUE_SOON_DAYS).reduce(
        (sum, s) => sum + statementRemaining(s),
        0,
      );
      const committedCents = openStatements.reduce((sum, s) => sum + statementRemaining(s), 0);
      const limitCents = lists.cards
        .filter((card) => inScopeAccount(card.id))
        .reduce((sum, card) => sum + (card.creditLimitCents ?? 0), 0);
      const fixedCents =
        lists.subscriptions.reduce((sum, sub) => sum + normalizeMonthly(sub.amountCents, sub.cycle), 0) +
        lists.recurring.reduce(
          (sum, rec) => (rec.status === 'active' ? sum + normalizeMonthly(rec.amountCents, rec.frequency) : sum),
          0,
        );
      return reply.code(200).send({
        period: range,
        previousPeriod: previous,
        netLiquidBalanceCents: accountsTotalCents - dueSoonCents,
        accountsTotalCents,
        dueSoonCents,
        openInvoices: {
          committedCents,
          limitCents,
          utilizationPct: limitCents > 0 ? Math.round((committedCents / limitCents) * 1000) / 10 : null,
        },
        savingsRatePct: savingsRatePct(now.incomeCents, now.expenseCents),
        savingsRateTargetPct: SAVINGS_TARGET_PCT,
        previousSavingsRatePct: savingsRatePct(before.incomeCents, before.expenseCents),
        fixedVsDiscretionary: {
          fixedCents,
          discretionaryCents: Math.max(0, now.expenseCents - fixedCents),
          fixedPctOfIncome: now.incomeCents > 0 ? Math.round((fixedCents / now.incomeCents) * 1000) / 10 : null,
        },
        incomeCents: now.incomeCents,
        expenseCents: now.expenseCents,
        previousIncomeCents: before.incomeCents,
        previousExpenseCents: before.expenseCents,
        netWorthCents: accountsTotalCents - committedCents,
      });
    } catch (e) {
      return handleError(e, reply);
    }
  });

  app.get('/analytics/cashflow-series', async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = analyticsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const range = resolveRange(parsed.data.period, today(), parsed.data.from, parsed.data.to);
      const previous = previousRangeOf(range);
      const [current, prev] = await Promise.all([
        opts.source.dailySums(ctx.householdId, range.from, range.to, parsed.data.accountId),
        opts.source.dailySums(ctx.householdId, previous.from, previous.to, parsed.data.accountId),
      ]);
      return reply.code(200).send(buildCashflowSeries(range, previous, current, prev));
    } catch (e) {
      return handleError(e, reply);
    }
  });

  app.get('/analytics/category-breakdown', async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = categoryBreakdownQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const range = resolveRange(parsed.data.period, today(), parsed.data.from, parsed.data.to);
      const kind = parsed.data.kind ?? 'expense';
      const [sums, lists] = await Promise.all([
        opts.source.categorySums(ctx.householdId, range.from, range.to, kind, parsed.data.accountId),
        opts.source.loadLists(ctx.householdId),
      ]);
      return reply.code(200).send(buildCategoryBreakdown(sums, lists.categories, range, kind));
    } catch (e) {
      return handleError(e, reply);
    }
  });

  app.get('/analytics/budget-consumption', async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    try {
      const lists = await opts.source.loadLists(ctx.householdId);
      return reply.code(200).send({ items: buildBudgetConsumption(lists.budgets), total: lists.budgets.length });
    } catch (e) {
      return handleError(e, reply);
    }
  });

  app.get('/analytics/daily-heatmap', async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = analyticsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const end = parsed.data.to ?? today();
      const sums = await opts.source.dailySums(ctx.householdId, addDays(end, -34), end, parsed.data.accountId);
      return reply.code(200).send(buildDailyHeatmap(sums, end));
    } catch (e) {
      return handleError(e, reply);
    }
  });

  app.get('/analytics/net-worth-history', async (req, reply) => {
    let ctx;
    try {
      ctx = await resolve(req);
    } catch (e) {
      return handleError(e, reply);
    }
    const parsed = analyticsQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const now = today();
      const since = addMonths(now.slice(0, 7), -(NET_WORTH_MONTHS - 1));
      const [lists, flows] = await Promise.all([
        opts.source.loadLists(ctx.householdId),
        opts.source.monthlyFlows(ctx.householdId, since),
      ]);
      const inScope = (id: string): boolean => !parsed.data.accountId || id === parsed.data.accountId;
      const accountsTotal = lists.bankAccounts.filter((a) => inScope(a.id)).reduce((s, a) => s + a.balanceCents, 0);
      const committed = lists.statements
        .filter((s) => isOpenStatement(s) && inScope(s.accountId))
        .reduce((s, st) => s + statementRemaining(st), 0);
      return reply.code(200).send({ months: buildNetWorthHistory(accountsTotal - committed, flows, now, NET_WORTH_MONTHS) });
    } catch (e) {
      return handleError(e, reply);
    }
  });
};

const addMonths = (yearMonth: string, delta: number): string => {
  const cursor = new Date(`${yearMonth}-01T00:00:00.000Z`);
  cursor.setUTCMonth(cursor.getUTCMonth() + delta);
  return toISODate(cursor).slice(0, 7);
};
