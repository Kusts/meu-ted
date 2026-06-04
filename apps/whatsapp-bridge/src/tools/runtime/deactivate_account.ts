/**
 * deactivate_account — Runtime implementation
 * Soft-delete: sets deleted_at and active=false.
 * Cannot deactivate if it has non-deleted transactions referencing it.
 */

import { query } from '../db.js';
import type { DeactivateAccountResult } from '../types.js';
import { validateUUID } from '../errors.js';

export async function deactivateAccount(
  accountId: string,
  householdId: string
): Promise<DeactivateAccountResult> {
  try {
    validateUUID(accountId, 'account_id');
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
      return { success: false, error: 'Account not found or already deactivated' };
    }

    const txCount = await query(
      `SELECT COUNT(*) as cnt FROM transactions
       WHERE (from_account_id = $1 OR to_account_id = $1)
       AND household_id = $2 AND deleted_at IS NULL`,
      [accountId, householdId]
    );

    if (Number(txCount.rows[0].cnt) > 0) {
      return { success: false, error: 'Account has transactions and cannot be deactivated' };
    }

    const result = await query(
      `UPDATE accounts SET deleted_at = NOW(), active = false WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id`,
      [accountId, householdId]
    );

    return { success: true, account_id: result.rows[0].id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}