// Monthly Projection — projeção financeira mensal
// Pure function: transactions + payables recorrentes -> saldo projetado

import type { Payable, Transaction } from '../types/domain.js';

export type MonthlyProjectionBreakdown = {
  income: number;
  expense: number;
  pending: number;
};

export type MonthlyProjectionResult = {
  yearMonth: string;
  projectedBalance: number;
  breakdown: MonthlyProjectionBreakdown;
};

/**
 * Pure function: calcula projeção mensal.
 * - income = sum transactions kind==='income' where date YYYY-MM === yearMonth
 * - expense = sum transactions kind==='expense' where date YYYY-MM === yearMonth
 * - pending = sum payables where dueDate YYYY-MM === yearMonth && status !== 'paid' && status !== 'cancelled'
 *            (inclui pending + overdue; cancelled/paid ignorados)
 * - projectedBalance = income - expense - pending
 *
 * @param transactions - already scoped to household (in-memory or store)
 * @param payables - already scoped to household
 * @param yearMonth - YYYY-MM
 * @param _clock - optional clock for determinism (reserved for future recurring expansion)
 */
export function computeMonthlyProjection(
  transactions: Pick<Transaction, 'date' | 'kind' | 'amountCents'>[],
  payables: Pick<Payable, 'dueDate' | 'status' | 'amountCents' | 'type'>[],
  yearMonth: string,
  _clock?: () => Date,
): MonthlyProjectionResult {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.date.slice(0, 7) !== yearMonth) continue;
    if (t.kind === 'income') income += t.amountCents;
    else if (t.kind === 'expense') expense += t.amountCents;
    // transferências ignoradas na projeção (não afetam income/expense)
  }

  let pending = 0;
  for (const p of payables) {
    if (!p.dueDate || p.dueDate.slice(0, 7) !== yearMonth) continue;
    if (p.status === 'cancelled' || p.status === 'paid') continue;
    // pending + overdue counted; future: poderia filtrar só recurring mas mantém compatível com one_time também
    pending += p.amountCents;
  }

  const projectedBalance = income - expense - pending;
  return {
    yearMonth,
    projectedBalance,
    breakdown: { income, expense, pending },
  };
}

export function parseYearMonthQuery(query: Record<string, unknown>): { yearMonth: string } | { error: string } {
  const raw = query.yearMonth as string | undefined;
  if (raw === undefined || raw === null || raw === '') {
    return { error: 'yearMonth is required (YYYY-MM)' };
  }
  if (typeof raw !== 'string') return { error: 'yearMonth must be string YYYY-MM' };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    return { error: 'yearMonth must match YYYY-MM with valid month 01-12' };
  }
  return { yearMonth: raw };
}
