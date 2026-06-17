import { randomUUID } from 'node:crypto';
import type { Budget, BudgetStatus, BudgetTrend } from '../types/domain.js';
import type { BudgetStore } from './store.js';
import type { InMemoryState } from '../writes/in-memory.js';
import { domainErrors } from '../writes/errors.js';

function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

function getPeriodBounds(date: string, period: string): { start: string; end: string } {
  const d = new Date(date + 'T00:00:00');
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  let start: string, end: string;
  if (period === 'monthly') {
    start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else if (period === 'quarterly') {
    const qStart = Math.floor(m / 3) * 3;
    start = `${y}-${String(qStart + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, qStart + 3, 0)).getUTCDate();
    end = `${y}-${String(qStart + 3).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    start = `${y}-01-01`;
    end = `${y}-12-31`;
  }
  return { start, end };
}

export const createInMemoryBudgetStore = (state: InMemoryState): BudgetStore => {
  if (!(state as any)._budgets) (state as any)._budgets = [] as Budget[];
  const budgets = (state as any)._budgets as Budget[];

  const calcSpent = (budget: Budget): number => {
    const today = new Date().toISOString().slice(0, 10);
    const { start, end } = getPeriodBounds(today, budget.period);
    return state.transactions
      .filter(t => t.householdId === budget.householdId && t.categoryId === budget.categoryId && t.kind === 'expense' && t.date >= start && t.date <= end && !state.deletedTransactions.has(t.id))
      .reduce((s, t) => s + t.amountCents, 0);
  };

  return {
    async listBudgets(householdId) {
      return budgets
        .filter(b => b.householdId === householdId)
        .map(b => {
          const spent = calcSpent(b);
          return { ...b, spentCents: spent, remainingCents: Math.max(0, b.amountCents - spent), percentUsed: Math.round((spent / b.amountCents) * 100) };
        })
        .sort((a, b) => b.percentUsed - a.percentUsed);
    },

    async createBudget(householdId, input) {
      const b = opt<Budget>(
        { id: randomUUID(), householdId, categoryId: input.categoryId, name: input.name, amountCents: input.amountCents, period: input.period, startDate: input.startDate, alertThreshold: input.alertThreshold ?? 80, rollover: false },
        {} as Partial<Budget>,
      );
      budgets.push(b);
      return { ...b, ...calcSpent(b) ? { spentCents: calcSpent(b), remainingCents: 0, percentUsed: 0 } : {} } as any;
    },

    async updateBudget(householdId, budgetId, patch) {
      const b = budgets.find(x => x.id === budgetId && x.householdId === householdId);
      if (!b) throw domainErrors.notFound('Orçamento');
      if (patch.amountCents !== undefined) b.amountCents = patch.amountCents;
      if (patch.alertThreshold !== undefined) b.alertThreshold = patch.alertThreshold;
      return b;
    },

    async getBudgetTrends(householdId, budgetId, monthsBack = 3) {
      const b = budgets.find(x => x.id === budgetId && x.householdId === householdId);
      if (!b) throw domainErrors.notFound('Orçamento');
      const trends: BudgetTrend[] = [];
      const now = new Date();
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - i);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const { start, end } = getPeriodBounds(`${ym}-01`, b.period);
        const spent = state.transactions
          .filter(t => t.householdId === householdId && t.categoryId === b.categoryId && t.kind === 'expense' && t.date >= start && t.date <= end && !state.deletedTransactions.has(t.id))
          .reduce((s, t) => s + t.amountCents, 0);
        trends.push({ yearMonth: ym, budgetCents: b.amountCents, spentCents: spent });
      }
      return trends;
    },
  };
};
