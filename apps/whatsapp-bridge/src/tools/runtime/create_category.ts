/**
 * create_category — Runtime implementation
 * Write tool: inserts new category, no balance impact.
 */

import { query } from '../db.js';
import type { CreateCategoryResult } from '../types.js';
import { validateUUID, validateNonEmpty, validateKind } from '../errors.js';
import { randomUUID } from 'crypto';

const ALLOWED_KINDS: string[] = ['expense', 'income'];

export async function createCategory(
  name: string,
  kind: 'expense' | 'income',
  householdId: string
): Promise<CreateCategoryResult> {
  // Validate inputs
  try {
    validateNonEmpty(name, 'name');
    validateKind(kind, ALLOWED_KINDS, 'kind');
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Validation error',
    };
  }

  try {
    // Check duplicate name+kind for household
    const existing = await query(
      `SELECT id FROM categories WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND kind = $3 AND deleted_at IS NULL LIMIT 1`,
      [householdId, name.trim(), kind]
    );

    if (existing.rows.length > 0) {
      return {
        success: false,
        error: `Category "${name.trim()}" (${kind}) already exists in this household`,
      };
    }

    const id = randomUUID();

    const result = await query(
      `INSERT INTO categories (id, household_id, name, kind, active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING id`,
      [id, householdId, name.trim(), kind]
    );

    return {
      success: true,
      category_id: result.rows[0].id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('duplicate') || message.includes('unique')) {
      return { success: false, error: `Category "${name.trim()}" (${kind}) already exists` };
    }
    return { success: false, error: message };
  }
}