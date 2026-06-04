/**
 * update_account — Runtime implementation
 * Write tool: updates account name. initial_balance_cents is immutable.
 */

import { query } from '../db.js';
import type { UpdateAccountResult } from '../types.js';
import { validateUUID, validateNonEmpty } from '../errors.js';

export async function updateAccount(
  accountId: string,
  name: string,
  householdId: string
): Promise<UpdateAccountResult> {
  try {
    validateUUID(accountId, 'account_id');
    validateNonEmpty(name, 'name');
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const existing = await query(
      `SELECT id, active FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [accountId, householdId]
    );

    if (existing.rows.length === 0) {
      return { success: false, error: 'Account not found or inactive' };
    }

    if (!existing.rows[0].active) {
      return { success: false, error: 'Account is not active' };
    }

    const nameExists = await query(
      `SELECT id FROM accounts WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND id != $3 AND deleted_at IS NULL LIMIT 1`,
      [householdId, name.trim(), accountId]
    );

    if (nameExists.rows.length > 0) {
      return { success: false, error: `Account with name="${name.trim()}" already exists in this household` };
    }

    const result = await query(
      `UPDATE accounts SET name = $1, updated_at = NOW() WHERE id = $2 AND household_id = $3 AND deleted_at IS NULL RETURNING id`,
      [name.trim(), accountId, householdId]
    );

    return { success: true, account_id: result.rows[0].id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}