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
import { withTransaction } from '../db/pool.js';

type Row = Record<string, unknown>;

export const createLegacyPostgresGoalStore = (pool: Pool): GoalStore => {
  const base = createPostgresGoalStore(pool);

  return {
    ...base,
    async contributeToGoal(householdId, goalId, input) {
      return withTransaction(pool, async (client) => {
        const rows = await client.query<Row>(`SELECT * FROM goals WHERE id=$1 AND household_id=$2`, [goalId, householdId]);
        if (rows.rowCount === 0 || rows.rows.length === 0) throw domainErrors.notFound('Meta');
        const g = rows.rows[0]!;
        const newCurrent = Number(g['current_amount_cents']) + input.amountCents;
        const newStatus = newCurrent >= Number(g['target_amount_cents']) ? 'achieved' : 'active';
        await client.query(`UPDATE goals SET current_amount_cents=$1, status=$2, updated_at=NOW() WHERE id=$3 AND household_id=$4`, [newCurrent, newStatus, goalId, householdId]);
        const cid = randomUUID();
        const date = input.contributionDate ?? new Date().toISOString().slice(0, 10);
        await client.query(
          `INSERT INTO goal_contributions (id, goal_id, household_id, amount_cents, contribution_date, source, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [cid, goalId, householdId, input.amountCents, date, input.source ?? null, input.notes ?? null],
        );
        return { id: cid, goalId, amountCents: input.amountCents, contributionDate: date };
      });
    },
  };
};
