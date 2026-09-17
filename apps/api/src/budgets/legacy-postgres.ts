/**
 * Legacy Postgres implementation of BudgetStore (V4.1 Task 2.15).
 *
 * The canonical store (`postgres.ts`) is schema-compatible for every
 * method EXCEPT the new category gate, which queries the `status` column
 * that does not exist on the legacy schema (`active` boolean instead).
 * This twin inherits everything and overrides only `createBudget` with
 * the legacy-shaped gate (same 404/400 shapes) over the shared insert
 * core. `updateBudget` takes no category field, so it needs no gate.
 */

import type { Pool } from 'pg';
import { domainErrors } from '../writes/errors.js';
import { assertCategoryKind } from '../categories/resolve.js';
import { createPostgresBudgetStore, insertBudgetRow } from './postgres.js';
import type { BudgetStore } from './store.js';

type Row = Record<string, unknown>;

export const createLegacyPostgresBudgetStore = (pool: Pool): BudgetStore => {
  const base = createPostgresBudgetStore(pool);
  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  return {
    ...base,
    async createBudget(householdId, input) {
      const rows = await query<Row>(
        `SELECT id, kind FROM categories WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
        [input.categoryId, householdId],
      );
      if (rows.length === 0) throw domainErrors.notFound('Categoria');
      assertCategoryKind(
        { id: input.categoryId, householdId, kind: String(rows[0]!['kind']), status: 'active' },
        'expense',
      );
      return insertBudgetRow(query, householdId, input);
    },
  };
};
