import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Budget, BudgetStatus, BudgetTrend } from '../types/domain.js';
import type { BudgetStore } from './store.js';
import { domainErrors } from '../writes/errors.js';

type Row = Record<string, unknown>;

function getPeriodBounds(date: string, period: string): { start: string; end: string } {
  const d = new Date(date + 'T00:00:00');
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  if (period === 'monthly') {
    return { start: `${y}-${String(m+1).padStart(2,'0')}-01`, end: `${y}-${String(m+1).padStart(2,'0')}-${String(new Date(Date.UTC(y,m+1,0)).getUTCDate()).padStart(2,'0')}` };
  } else if (period === 'quarterly') {
    const qs = Math.floor(m/3)*3;
    return { start: `${y}-${String(qs+1).padStart(2,'0')}-01`, end: `${y}-${String(qs+3).padStart(2,'0')}-${String(new Date(Date.UTC(y,qs+3,0)).getUTCDate()).padStart(2,'0')}` };
  }
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export const createPostgresBudgetStore = (pool: Pool): BudgetStore => {
  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values); return res.rows;
  };

  const calcSpent = async (budgetId: string, categoryId: string, householdId: string, period: string): Promise<number> => {
    const today = new Date().toISOString().slice(0, 10);
    const { start, end } = getPeriodBounds(today, period);
    const rows = await query<Row>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS spent FROM transactions WHERE household_id=$1 AND category_id=$2 AND kind='expense' AND date>=$3 AND date<=$4 AND deleted_at IS NULL`,
      [householdId, categoryId, start, end],
    );
    return Number(rows[0]!['spent']);
  };

  return {
    async listBudgets(householdId) {
      const rows = await query<Row>(`SELECT * FROM budgets WHERE household_id=$1 ORDER BY amount_cents DESC`, [householdId]);
      const result: BudgetStatus[] = [];
      for (const r of rows) {
        const b: Budget = { id: r['id'] as string, householdId, categoryId: r['category_id'] as string, name: r['name'] as string, amountCents: Number(r['amount_cents']), period: r['period'] as Budget['period'], startDate: (r['start_date'] as Date).toISOString().slice(0,10), alertThreshold: Number(r['alert_threshold']), rollover: r['rollover'] as boolean };
        const spent = await calcSpent(b.id, b.categoryId, householdId, b.period);
        result.push({ ...b, spentCents: spent, remainingCents: Math.max(0, b.amountCents - spent), percentUsed: Math.round((spent / b.amountCents) * 100) });
      }
      result.sort((a, b) => b.percentUsed - a.percentUsed);
      return result;
    },

    async createBudget(householdId, input) {
      const id = randomUUID();
      await query(`INSERT INTO budgets (id,household_id,category_id,name,amount_cents,period,start_date,alert_threshold) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, householdId, input.categoryId, input.name, input.amountCents, input.period, input.startDate, input.alertThreshold ?? 80]);
      const rows = await query<Row>(`SELECT * FROM budgets WHERE id=$1`, [id]);
      const r = rows[0]!;
      return { id, householdId, categoryId: input.categoryId, name: input.name, amountCents: input.amountCents, period: input.period, startDate: input.startDate, alertThreshold: input.alertThreshold ?? 80, rollover: false };
    },

    async updateBudget(householdId, budgetId, patch) {
      const existing = await query<Row>(`SELECT * FROM budgets WHERE id=$1 AND household_id=$2`, [budgetId, householdId]);
      if (existing.length === 0) throw domainErrors.notFound('Orçamento');
      if (patch.amountCents !== undefined) await query(`UPDATE budgets SET amount_cents=$1, updated_at=NOW() WHERE id=$2`, [patch.amountCents, budgetId]);
      if (patch.alertThreshold !== undefined) await query(`UPDATE budgets SET alert_threshold=$1, updated_at=NOW() WHERE id=$2`, [patch.alertThreshold, budgetId]);
      const rows = await query<Row>(`SELECT * FROM budgets WHERE id=$1`, [budgetId]);
      const r = rows[0]!;
      return { id: r['id'] as string, householdId, categoryId: r['category_id'] as string, name: r['name'] as string, amountCents: Number(r['amount_cents']), period: r['period'] as Budget['period'], startDate: (r['start_date'] as Date).toISOString().slice(0,10), alertThreshold: Number(r['alert_threshold']), rollover: r['rollover'] as boolean };
    },

    async getBudgetTrends(householdId, budgetId, monthsBack = 3) {
      const existing = await query<Row>(`SELECT * FROM budgets WHERE id=$1 AND household_id=$2`, [budgetId, householdId]);
      if (existing.length === 0) throw domainErrors.notFound('Orçamento');
      const b = existing[0]!;
      const trends: BudgetTrend[] = [];
      const now = new Date();
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now); d.setUTCMonth(d.getUTCMonth() - i);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
        const { start, end } = getPeriodBounds(`${ym}-01`, b['period'] as string);
        const rows = await query<Row>(`SELECT COALESCE(SUM(amount_cents),0) AS spent FROM transactions WHERE household_id=$1 AND category_id=$2 AND kind='expense' AND date>=$3 AND date<=$4 AND deleted_at IS NULL`,
          [householdId, b['category_id'], start, end]);
        trends.push({ yearMonth: ym, budgetCents: Number(b['amount_cents']), spentCents: Number(rows[0]!['spent']) });
      }
      return trends;
    },
  };
};
