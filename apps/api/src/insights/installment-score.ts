// InstallmentScore — score de parcelas de cartão por mês
// Pure function similar a payment_score mas para card_purchases/parcelas

export type InstallmentScoreInput = {
  date?: string;
  dueDate?: string;
  status?: string;
  statementStatus?: string;
  paid?: boolean;
};

export type InstallmentScoreResult = {
  score: number;
  total: number;
  paid: number;
  overdue: number;
  month: string;
};

/**
 * Pure function: calcula score de parcelas para um mês específico.
 * - Filtra purchases onde (date ou dueDate) pertence ao mês YYYY-MM
 * - Ignora canceladas (status === 'cancelled' ou statementStatus === 'cancelled')
 * - paid = status === 'paid' || paid === true || statementStatus === 'paid'
 * - overdue = status === 'overdue' || statementStatus === 'overdue'
 * - score = total === 0 ? 0 : Math.round(paid/total *100)
 */
export function computeInstallmentScore(
  purchases: InstallmentScoreInput[],
  month: string,
): InstallmentScoreResult {
  const filtered = purchases.filter((p) => {
    const d = p.date ?? p.dueDate;
    if (!d) return false;
    if (d.slice(0, 7) !== month) return false;
    if (p.status === 'cancelled' || p.statementStatus === 'cancelled') return false;
    return true;
  });

  const total = filtered.length;
  if (total === 0) {
    return { score: 0, total: 0, paid: 0, overdue: 0, month };
  }

  let paid = 0;
  let overdue = 0;
  for (const p of filtered) {
    const isPaid = p.status === 'paid' || p.paid === true || p.statementStatus === 'paid';
    const isOverdue = p.status === 'overdue' || p.statementStatus === 'overdue';
    if (isPaid) paid += 1;
    else if (isOverdue) overdue += 1;
    // open/closed/partial etc count in total but not as paid/overdue (score lower)
  }

  const score = Math.round((paid / total) * 100);
  return { score, total, paid, overdue, month };
}

export function parseMonthQuery(query: Record<string, unknown>): { month: string } | { error: string } {
  const raw = query.month as string | undefined;
  if (raw === undefined || raw === null || raw === '') {
    return { error: 'month is required (YYYY-MM)' };
  }
  if (typeof raw !== 'string') return { error: 'month must be string YYYY-MM' };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
    return { error: 'month must match YYYY-MM with valid month 01-12' };
  }
  return { month: raw };
}
