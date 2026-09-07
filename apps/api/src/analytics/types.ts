/**
 * Analytics foundation (item 14, etapa A): KPI/series DTOs and query shapes.
 *
 * Period presets mirror the PWA filter drawer: last30days | lastMonth |
 * thisYear | custom (from/to required). accountId optionally scopes every
 * computation to a single account.
 */

import { z } from 'zod';

export const analyticsPeriodSchema = z.enum(['last30days', 'lastMonth', 'thisYear', 'custom']);

export const analyticsBaseSchema = z.object({
  period: analyticsPeriodSchema.optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
    .optional(),
  accountId: z.string().uuid().optional(),
});

export const analyticsQuerySchema = analyticsBaseSchema.superRefine((value, ctx) => {
  if (value.period === 'custom' && (!value.from || !value.to)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'custom period requires from and to' });
  }
  if (value.from && value.to && value.from > value.to) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from must not be after to' });
  }
});

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export type AnalyticsRange = { from: string; to: string };

export type CategoryBreakdownQuery = AnalyticsQuery & { kind?: 'expense' | 'income' };

export const categoryBreakdownQuerySchema = analyticsBaseSchema
  .extend({
    kind: z.enum(['expense', 'income']).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.period === 'custom' && (!value.from || !value.to)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'custom period requires from and to' });
    }
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'from must not be after to' });
    }
  });

export type MoneyPoint = { date: string; valueCents: number };

export type KpiDelta = { valueCents: number | null; pct: number | null };

export type AnalyticsKpis = {
  period: AnalyticsRange;
  previousPeriod: AnalyticsRange;
  netLiquidBalanceCents: number;
  accountsTotalCents: number;
  dueSoonCents: number;
  openInvoices: { committedCents: number; limitCents: number; utilizationPct: number | null };
  savingsRatePct: number | null;
  savingsRateTargetPct: number;
  previousSavingsRatePct: number | null;
  fixedVsDiscretionary: FixedVsDiscretionary;
  incomeCents: number;
  expenseCents: number;
  previousIncomeCents: number;
  previousExpenseCents: number;
  netWorthCents: number;
};

/**
 * H-10: fixed-vs-discretionary always declares its universe. `scope`
 * tells whether `fixedCents` covers the household or one account;
 * `subscriptionsCents` is the household-wide subscriptions component —
 * included in `fixedCents` only when scope is 'household'.
 */
export type FixedVsDiscretionary = {
  scope: 'household' | 'account';
  fixedCents: number;
  discretionaryCents: number;
  fixedPctOfIncome: number | null;
  subscriptionsCents: number;
};

export type CashflowSeries = {
  period: AnalyticsRange;
  current: MoneyPoint[];
  previous: MoneyPoint[];
};

export type CategorySlice = {
  categoryId: string;
  name: string;
  totalCents: number;
  pct: number;
  color: string | null;
};

export type CategoryBreakdown = {
  period: AnalyticsRange;
  kind: 'expense' | 'income';
  totalCents: number;
  slices: CategorySlice[];
};

export type BudgetConsumptionItem = {
  budgetId: string;
  name: string;
  categoryId: string;
  spentCents: number;
  amountCents: number;
  pctUsed: number;
  overBudget: boolean;
  thresholdBreached: boolean;
};

export type HeatmapDay = { date: string; totalCents: number; level: 0 | 1 | 2 | 3 | 4 };
export type HeatmapWeek = { weekStart: string; days: HeatmapDay[] };

export type DailyHeatmap = {
  endDate: string;
  weeks: HeatmapWeek[];
};

export type NetWorthPoint = { month: string; netWorthCents: number };
