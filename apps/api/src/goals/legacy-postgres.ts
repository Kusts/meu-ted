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
      // V4.1 SPEC §9.6: atomic increment (same contract as the canonical
      // store) + legacy household_id on the contribution row.
      return withTransaction(pool, async (client) => {
        const updated = await client.query<Row>(
          `UPDATE goals
              SET current_amount_cents = current_amount_cents + $3,
                  status = CASE WHEN current_amount_cents + $3 >= target_amount_cents THEN 'achieved' ELSE status END,
                  updated_at = NOW()
            WHERE id = $1 AND household_id = $2 AND status <> 'cancelled'`,
          [goalId, householdId, input.amountCents],
        );
        if ((updated.rowCount ?? 0) === 0) {
          const existing = await client.query<Row>(`SELECT status FROM goals WHERE id=$1 AND household_id=$2`, [goalId, householdId]);
          if (existing.rowCount === 0 || existing.rows.length === 0) throw domainErrors.notFound('Meta');
          throw domainErrors.invalid('goal', 'meta cancelada não aceita aportes');
        }
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
