/**
 * deactivate_category — Runtime implementation
 * Soft-delete: sets deleted_at.
 * Cannot deactivate if it has non-deleted transactions referencing it.
 */

import { query } from '../db.js';
import type { DeactivateCategoryResult } from '../types.js';
import { validateUUID } from '../errors.js';

export async function deactivateCategory(
  categoryId: string,
  householdId: string
): Promise<DeactivateCategoryResult> {
  try {
    validateUUID(categoryId, 'category_id');
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const existing = await query(
      `SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [categoryId, householdId]
    );

    if (existing.rows.length === 0) {
      return { success: false, error: 'Category not found or already deactivated' };
    }

    const txCount = await query(
      `SELECT COUNT(*) as cnt FROM transactions
       WHERE category_id = $1 AND household_id = $2 AND deleted_at IS NULL`,
      [categoryId, householdId]
    );

    if (Number(txCount.rows[0].cnt) > 0) {
      return { success: false, error: 'Category has transactions and cannot be deactivated' };
    }

    const result = await query(
      `UPDATE categories SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id`,
      [categoryId, householdId]
    );

    return { success: true, category_id: result.rows[0].id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}