import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Goal, GoalContribution } from '../types/domain.js';
import type { GoalStore } from './store.js';
import { domainErrors } from '../writes/errors.js';
type Row = Record<string, unknown>;

export const createPostgresGoalStore = (pool: Pool): GoalStore => {
  const query = async <R extends Row = Row>(t: string, v: unknown[] = []) => { const r = await pool.query<R>(t, v); return r.rows; };
  return {
    async listGoals(householdId) {
      const rows = await query<Row>(`SELECT * FROM goals WHERE household_id=$1 AND status<>'cancelled' ORDER BY target_amount_cents DESC`, [householdId]);
      return rows.map(r => ({ id: r['id'] as string, householdId, name: r['name'] as string, goalType: r['goal_type'] as Goal['goalType'], targetAmountCents: Number(r['target_amount_cents']), currentAmountCents: Number(r['current_amount_cents']), startDate: (r['start_date'] as Date).toISOString().slice(0,10), status: r['status'] as Goal['status'] }));
    },
    async createGoal(householdId, input) {
      const id = randomUUID();
      await query(`INSERT INTO goals (id,household_id,name,goal_type,target_amount_cents,start_date,target_date,description,category_id,account_id,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [id, householdId, input.name, input.goalType, input.targetAmountCents, input.startDate, input.targetDate??null, input.description??null, input.categoryId??null, input.accountId??null, input.notes??null]);
      return { id, householdId, name: input.name, goalType: input.goalType as Goal['goalType'], targetAmountCents: input.targetAmountCents, currentAmountCents: 0, startDate: input.startDate, status: 'active' as const };
    },
    async contributeToGoal(householdId, goalId, input) {
      const rows = await query<Row>(`SELECT * FROM goals WHERE id=$1 AND household_id=$2`, [goalId, householdId]);
      if (rows.length === 0) throw domainErrors.notFound('Meta');
      const g = rows[0]!;
      const newCurrent = Number(g['current_amount_cents']) + input.amountCents;
      const newStatus = newCurrent >= Number(g['target_amount_cents']) ? 'achieved' : 'active';
      await query(`UPDATE goals SET current_amount_cents=$1, status=$2, updated_at=NOW() WHERE id=$3`, [newCurrent, newStatus, goalId]);
      const cid = randomUUID();
      await query(`INSERT INTO goal_contributions (id,goal_id,amount_cents,contribution_date,source,notes) VALUES ($1,$2,$3,$4,$5,$6)`, [cid, goalId, input.amountCents, input.contributionDate ?? new Date().toISOString().slice(0,10), input.source??null, input.notes??null]);
      return { id: cid, goalId, amountCents: input.amountCents, contributionDate: input.contributionDate ?? new Date().toISOString().slice(0,10) };
    },
    async cancelGoal(householdId, goalId, _reason) {
      const rows = await query<Row>(`SELECT * FROM goals WHERE id=$1 AND household_id=$2`, [goalId, householdId]);
      if (rows.length === 0) throw domainErrors.notFound('Meta');
      await query(`UPDATE goals SET status='cancelled', updated_at=NOW() WHERE id=$1`, [goalId]);
      return { id: goalId, householdId, name: rows[0]!['name'] as string, goalType: rows[0]!['goal_type'] as Goal['goalType'], targetAmountCents: Number(rows[0]!['target_amount_cents']), currentAmountCents: Number(rows[0]!['current_amount_cents']), startDate: (rows[0]!['start_date'] as Date).toISOString().slice(0,10), status: 'cancelled' as const };
    },
  };
};
