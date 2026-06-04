/**
 * delete_transaction — Runtime implementation
 * Soft-delete: marks transaction as deleted_at. Data is preserved.
 */

import { query } from '../db.js';
import type { DeleteTransactionResult } from '../types.js';
import { validateUUID } from '../errors.js';

export async function deleteTransaction(
  transactionId: string,
  householdId: string
): Promise<DeleteTransactionResult> {
  try {
    validateUUID(transactionId, 'transaction_id');
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const existing = await query(
      `SELECT id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [transactionId, householdId]
    );

    if (existing.rows.length === 0) {
      return { success: false, error: 'Transaction not found or already deleted' };
    }

    const result = await query(
      `UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id`,
      [transactionId, householdId]
    );

    return { success: true, transaction_id: result.rows[0].id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}