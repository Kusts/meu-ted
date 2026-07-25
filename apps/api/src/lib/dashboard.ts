import type { Account, Category, Transaction, DashboardSummary } from '../types/domain.js';

const monthStartIso = (today: Date): string => {
  const y = today.getUTCFullYear();
  const m = String(today.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

const prevMonthStartIso = (today: Date): string => {
  const d = new Date(today);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

const inMonth = (date: string, monthStart: string, nextMonthStart: string): boolean =>
  date >= monthStart && date < nextMonthStart;

export const buildDashboardSummary = (
  householdId: string,
  accounts: Account[],
  categories: Category[],
  transactions: Transaction[],
  today: Date = new Date(),
): DashboardSummary => {
  const ms = monthStartIso(today);
  const ps = prevMonthStartIso(today);
  const todayIso = today.toISOString().slice(0, 10);

  const totalBalanceCents = accounts
    .filter((a) => a.status === 'active' && a.kind !== 'credit_card')
    .reduce((sum, a) => sum + a.balanceCents, 0);

  const monthTx = transactions.filter((t) => inMonth(t.date, ms, todayIso));
  const monthIncomeCents = monthTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amountCents, 0);
  const monthExpenseCents = monthTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amountCents, 0);

  const prevTx = transactions.filter((t) => inMonth(t.date, ps, ms));
  const prevIncome = prevTx.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amountCents, 0);
  const prevExpense = prevTx.filter((t) => t.kind === 'expense').reduce((s, t) => s + t.amountCents, 0);

  // cash flow last 30 days
  const last30Start = new Date(today);
  last30Start.setUTCDate(last30Start.getUTCDate() - 29);
  const last30Iso = last30Start.toISOString().slice(0, 10);
  const last30 = transactions.filter((t) => t.date >= last30Iso && t.date <= todayIso);
  const cashFlowLast30DaysCents = last30.reduce((s, t) => s + (t.kind === 'income' ? t.amountCents : t.kind === 'expense' ? -t.amountCents : 0), 0);

  const categoryById = new Map(categories.map((c) => [c.id, c.name] as const));

  // top expenses
  const topExpenses = monthTx
    .filter((t) => t.kind === 'expense')
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, 5)
    .map((t) => {
      const categoryName = t.categoryId ? categoryById.get(t.categoryId) : undefined;
      return { transactionId: t.id, description: t.description, amountCents: t.amountCents, date: t.date, ...(categoryName ? { categoryName } : {}) };
    });

  // top categories (this month)
  const catAgg = (kind: 'expense' | 'income') => {
    const map = new Map<string, { categoryId?: string; categoryName: string; totalCents: number }>();
    for (const t of monthTx.filter((t) => t.kind === kind)) {
      const catId: string | undefined = t.categoryId ?? undefined;
      const key = t.categoryId ?? 'sem-categoria';
      const name = t.categoryId ? categoryById.get(t.categoryId) ?? 'sem-categoria' : 'sem-categoria';
      const entry = map.get(key);
      if (entry) { entry.totalCents += t.amountCents; }
      else {
        const obj: { categoryId?: string; categoryName: string; totalCents: number } = { categoryName: name, totalCents: t.amountCents };
        if (catId !== undefined) obj.categoryId = catId;
        map.set(key, obj);
      }
    }
    return [...map.values()].sort((a, b) => b.totalCents - a.totalCents).slice(0, 5);
  };

  // alerts
  const alerts: DashboardSummary['alerts'] = [];
  if (totalBalanceCents < 0) alerts.push({ id: 'neg-balance', message: 'Saldo total negativo!', severity: 'warn' });
  if (monthExpenseCents > monthIncomeCents && monthIncomeCents > 0) alerts.push({ id: 'overspend', message: 'Despesas superam receitas este mês.', severity: 'warn' });
  if (totalBalanceCents === 0 && accounts.length === 0) alerts.push({ id: 'no-accounts', message: 'Cadastre sua primeira conta bancária.', severity: 'info' });

  return {
    householdId,
    generatedAt: today.toISOString(),
    totalBalanceCents,
    monthIncomeCents,
    monthExpenseCents,
    monthNetCents: monthIncomeCents - monthExpenseCents,
    cashFlowLast30DaysCents,
    topExpenses,
    topExpenseCategories: catAgg('expense'),
    topIncomeCategories: catAgg('income'),
    monthOverMonth: {
      incomeChangePercent: prevIncome > 0 ? Math.round(((monthIncomeCents - prevIncome) / prevIncome) * 100) : null,
      expenseChangePercent: prevExpense > 0 ? Math.round(((monthExpenseCents - prevExpense) / prevExpense) * 100) : null,
      netChangeCents: (monthIncomeCents - monthExpenseCents) - (prevIncome - prevExpense),
    },
    alerts,
  };
};
