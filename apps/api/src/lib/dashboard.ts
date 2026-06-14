import type { Account, Category, Transaction, DashboardSummary } from '../types/domain.js';

const monthStartIso = (today: Date): string => {
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

const daysAgoIso = (today: Date, days: number): string => {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

const inMonth = (date: string, monthStart: string): boolean => date >= monthStart;
const inLastNDays = (date: string, todayIso: string, days: number): boolean => {
  // inclusive of today; bounded by daysAgoIso
  return date >= daysAgoIso(new Date(`${todayIso}T00:00:00.000Z`), days - 1) && date <= todayIso;
};

export const buildDashboardSummary = (
  householdId: string,
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  today: Date = new Date(),
): DashboardSummary => {
  const monthStart = monthStartIso(today);
  const todayIso = today.toISOString().slice(0, 10);

  // V1: total balance sums active bank + cash (no credit cards in V1 per spec).
  const totalBalanceCents = accounts
    .filter((a) => a.status === 'active' && a.kind !== 'credit_card')
    .reduce((sum, a) => sum + a.balanceCents, 0);

  const monthIncomeCents = transactions
    .filter((t) => t.kind === 'income' && inMonth(t.date, monthStart))
    .reduce((sum, t) => sum + t.amountCents, 0);

  const monthExpenseCents = transactions
    .filter((t) => t.kind === 'expense' && inMonth(t.date, monthStart))
    .reduce((sum, t) => sum + t.amountCents, 0);

  // Cash flow = sum(income) - sum(expense) for last 30 days. Transfers are not income/expense.
  const last30 = transactions
    .filter((t) => inLastNDays(t.date, todayIso, 30))
    .reduce(
      (acc, t) => {
        if (t.kind === 'income') acc.in += t.amountCents;
        else if (t.kind === 'expense') acc.out += t.amountCents;
        return acc;
      },
      { in: 0, out: 0 },
    );
  const cashFlowLast30DaysCents = last30.in - last30.out;

  const categoryById = new Map(categories.map((c) => [c.id, c.name] as const));

  const topExpenses = transactions
    .filter((t) => t.kind === 'expense')
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5)
    .map((t) => {
      const categoryName = t.categoryId ? categoryById.get(t.categoryId) : undefined;
      return {
        transactionId: t.id,
        description: t.description,
        amountCents: t.amountCents,
        date: t.date,
        ...(categoryName !== undefined ? { categoryName } : {}),
      };
    });

  return {
    householdId,
    generatedAt: today.toISOString(),
    totalBalanceCents,
    monthIncomeCents,
    monthExpenseCents,
    monthNetCents: monthIncomeCents - monthExpenseCents,
    cashFlowLast30DaysCents,
    topExpenses,
  };
};
