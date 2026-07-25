/**
 * Legacy Postgres GoalStore for the pi_financeiro schema (DB_SCHEMA=legacy).
 *
 * The legacy `goals` table matches the canonical contract (list/create/cancel
 * work as-is), so this decorates the canonical store and overrides only
 * contributeToGoal: the legacy `goal_contributions` table has a NOT NULL
 * `household_id` column that the canonical INSERT omits.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { GoalStore } from './store.js';
import { createPostgresGoalStore } from './postgres.js';
import { domainErrors } from '../writes/errors.js';

type Row = Record<string, unknown>;

export const createLegacyPostgresGoalStore = (pool: Pool): GoalStore => {
  const base = createPostgresGoalStore(pool);
  const query = async <R extends Row = Row>(t: string, v: unknown[] = []): Promise<R[]> => {
    const r = await pool.query<R>(t, v);
    return r.rows;
  };

  return {
    ...base,
    async contributeToGoal(householdId, goalId, input) {
      const rows = await query<Row>(`SELECT * FROM goals WHERE id=$1 AND household_id=$2`, [goalId, householdId]);
      if (rows.length === 0) throw domainErrors.notFound('Meta');
      const g = rows[0]!;
      const newCurrent = Number(g['current_amount_cents']) + input.amountCents;
      const newStatus = newCurrent >= Number(g['target_amount_cents']) ? 'achieved' : 'active';
      await query(`UPDATE goals SET current_amount_cents=$1, status=$2, updated_at=NOW() WHERE id=$3`, [newCurrent, newStatus, goalId]);
      const cid = randomUUID();
      const date = input.contributionDate ?? new Date().toISOString().slice(0, 10);
      await query(
        `INSERT INTO goal_contributions (id, goal_id, household_id, amount_cents, contribution_date, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cid, goalId, householdId, input.amountCents, date, input.source ?? null, input.notes ?? null],
      );
      return { id: cid, goalId, amountCents: input.amountCents, contributionDate: date };
    },
  };
};
