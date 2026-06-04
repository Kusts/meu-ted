/**
 * list_categories — Runtime implementation
 * Read-only tool: queries categories table, no side effects.
 */

import { query } from '../db.js';
import type { ListCategoriesResult, CategoryRow } from '../types.js';

interface CategoryRowDb {
  id: string;
  name: string;
  kind: string;
  active: boolean;
}

export async function listCategories(householdId: string): Promise<ListCategoriesResult> {
  try {
    const result = await query<CategoryRowDb>(
      `SELECT id, name, kind, active
       FROM categories
       WHERE household_id = $1 AND active = true AND deleted_at IS NULL
       ORDER BY kind ASC, name ASC`,
      [householdId]
    );

    const categories: CategoryRow[] = result.rows.map((row: CategoryRowDb) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as 'expense' | 'income',
      active: row.active,
    }));

    return { success: true, categories };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message, categories: [] };
  }
}