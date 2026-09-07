import { z } from 'zod';

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const moneyCents = z.coerce.number().int().nonnegative();

const transactionKind = z.enum(['expense', 'income', 'transfer']);

const accountKind = z.enum(['bank', 'cash', 'credit_card']);
const categoryKind = z.enum(['expense', 'income']);
const accountStatus = z.enum(['active', 'inactive']);
const categoryStatus = z.enum(['active', 'inactive']);

export const transactionFiltersSchema = z
  .object({
    startDate: isoDate.optional(),
    endDate: isoDate.optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
    kind: transactionKind.optional(),
    minAmountCents: moneyCents.optional(),
    maxAmountCents: moneyCents.optional(),
    query: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional().default(50),
    offset: z.coerce.number().int().min(0).max(100_000).optional().default(0),
  })
  .refine(
    (v) => v.startDate === undefined || v.endDate === undefined || v.startDate <= v.endDate,
    { message: 'startDate must be <= endDate', path: ['startDate'] },
  )
  .refine(
    (v) =>
      v.minAmountCents === undefined ||
      v.maxAmountCents === undefined ||
      v.minAmountCents <= v.maxAmountCents,
    { message: 'minAmountCents must be <= maxAmountCents', path: ['minAmountCents'] },
  );

export type ParsedTransactionFilters = z.infer<typeof transactionFiltersSchema>;

export const accountSchema = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string().min(1).max(120),
  kind: accountKind,
  balanceCents: moneyCents,
  status: accountStatus,
});

export const categorySchema = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string().min(1).max(120),
  kind: categoryKind,
  status: categoryStatus,
});

export const transactionSchema = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  kind: transactionKind,
  description: z.string().min(1).max(240),
  amountCents: moneyCents,
  date: isoDate,
  accountId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  transferToAccountId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export const dashboardSummarySchema = z.object({
  householdId: z.string().uuid(),
  generatedAt: z.string().datetime(),
  totalBalanceCents: moneyCents,
  monthIncomeCents: moneyCents,
  monthExpenseCents: moneyCents,
  monthNetCents: moneyCents,
  cashFlowLast30DaysCents: moneyCents,
  topExpenses: z.array(
    z.object({
      transactionId: z.string().uuid(),
      description: z.string(),
      amountCents: moneyCents,
      date: isoDate,
      categoryName: z.string().optional(),
    }),
  ),
  topExpenseCategories: z.array(z.object({ categoryId: z.string().uuid().optional(), categoryName: z.string(), totalCents: moneyCents })),
  topIncomeCategories: z.array(z.object({ categoryId: z.string().uuid().optional(), categoryName: z.string(), totalCents: moneyCents })),
  monthOverMonth: z.object({ incomeChangePercent: z.number().nullable(), expenseChangePercent: z.number().nullable(), netChangeCents: moneyCents }),
  alerts: z.array(z.object({ id: z.string(), message: z.string(), severity: z.enum(['info', 'warn', 'good']) })),
});

export const quickInsightSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  severity: z.enum(['info', 'warn', 'good']),
});
