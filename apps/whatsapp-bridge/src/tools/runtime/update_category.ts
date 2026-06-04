/**
 * update_category — Runtime implementation
 * Write tool: updates category name and/or kind.
 * kind may be 'expense' or 'income'.
 */

import { query } from '../db.js';
import type { UpdateCategoryResult } from '../types.js';
import { validateUUID, validateNonEmpty } from '../errors.js';

const ALLOWED_KINDS: string[] = ['expense', 'income'];

export async function updateCategory(
  categoryId: string,
  name: string,
  kind: 'expense' | 'income',
  householdId: string
): Promise<UpdateCategoryResult> {
  try {
    validateUUID(categoryId, 'category_id');
    validateNonEmpty(name, 'name');
    if (!ALLOWED_KINDS.includes(kind)) {
      return { success: false, error: `kind must be one of: ${ALLOWED_KINDS.join(', ')}` };
    }
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const existing = await query(
      `SELECT id, active FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [categoryId, householdId]
    );

    if (existing.rows.length === 0) {
      return { success: false, error: 'Category not found or inactive' };
    }

    const nameExists = await query(
      `SELECT id FROM categories WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND kind = $3 AND id != $4 AND deleted_at IS NULL LIMIT 1`,
      [householdId, name.trim(), kind, categoryId]
    );

    if (nameExists.rows.length > 0) {
      return { success: false, error: `Category "${name.trim()}" (${kind}) already exists` };
    }

    const result = await query(
      `UPDATE categories SET name = $1, kind = $2, updated_at = NOW() WHERE id = $3 AND household_id = $4 AND deleted_at IS NULL RETURNING id`,
      [name.trim(), kind, categoryId, householdId]
    );

    return { success: true, category_id: result.rows[0].id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}