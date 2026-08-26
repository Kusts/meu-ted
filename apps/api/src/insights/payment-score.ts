import type { Payable } from '../types/domain.js';

export type PaymentScoreResult = {
  score: number;
  onTimeCount: number;
  totalCount: number;
  period: string;
};

/**
 * Pure function: computes on-time payment score from payables.
 * - Only payables with dueDate in [cutoff, now] (inclusive) and status != cancelled are counted.
 * - onTime = status === 'paid' && paidDate <= dueDate (paid on time or early).
 * - score = totalCount === 0 ? 0 : Math.round(onTimeCount / totalCount * 100)
 */
export function computePaymentScore(
  payables: Pick<Payable, 'dueDate' | 'status' | 'paidDate'>[],
  opts: { periodDays: number; now?: Date } = { periodDays: 90 },
): Omit<PaymentScoreResult, 'period'> & { periodDays: number } {
  const now = opts.now ?? new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - opts.periodDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const relevant = payables.filter((p) => {
    if (p.status === 'cancelled') return false;
    // dueDate must be within window [cutoff, today]
    if (p.dueDate < cutoffStr) return false;
    if (p.dueDate > todayStr) return false;
    return true;
  });

  const totalCount = relevant.length;
  if (totalCount === 0) {
    return { score: 0, onTimeCount: 0, totalCount: 0, periodDays: opts.periodDays };
  }

  let onTimeCount = 0;
  for (const p of relevant) {
    if (p.status === 'paid') {
      const paidDate = p.paidDate ?? p.dueDate;
      if (paidDate <= p.dueDate) onTimeCount += 1;
    }
    // overdue or paid late => not counted as onTime
  }

  const score = Math.round((onTimeCount / totalCount) * 100);
  return { score, onTimeCount, totalCount, periodDays: opts.periodDays };
}

export function parsePeriodQuery(query: Record<string, unknown>): { periodDays: number; periodLabel: string } | { error: string } {
  const rawPeriod = query.period as string | undefined;
  const rawDays = query.days as unknown as string | number | undefined;

  if (rawPeriod !== undefined && rawDays !== undefined) {
    return { error: 'Provide either period or days, not both' };
  }

  if (rawPeriod !== undefined) {
    if (typeof rawPeriod !== 'string') return { error: 'period must be string like 90d' };
    const m = rawPeriod.match(/^(\d+)d$/);
    if (!m) return { error: 'period must match /^\\d+d$/ e.g. 90d' };
    const days = parseInt(m[1]!, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) return { error: 'period days must be 1..365' };
    return { periodDays: days, periodLabel: `${days}d` };
  }

  if (rawDays !== undefined) {
    const days = typeof rawDays === 'string' ? parseInt(rawDays, 10) : Number(rawDays);
    if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1 || days > 365) {
      return { error: 'days must be integer 1..365' };
    }
    return { periodDays: days, periodLabel: `${days}d` };
  }

  // default 90d
  return { periodDays: 90, periodLabel: '90d' };
}
