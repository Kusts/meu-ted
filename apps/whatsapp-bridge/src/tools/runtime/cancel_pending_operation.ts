/**
 * cancel_pending_operation — Runtime implementation
 * Cancels a pending operation: marks as consumed with 'cancelled' status.
 */

import { query } from '../db.js';
import type { CancelPendingOperationResult } from '../types.js';
import { validateNonEmpty } from '../errors.js';

export async function cancelPendingOperation(
  chatId: string
): Promise<CancelPendingOperationResult> {
  try {
    validateNonEmpty(chatId, 'chat_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const existing = await query(
      `SELECT id FROM pending_operations
       WHERE chat_id = $1 AND expires_at > NOW() AND consumed_at IS NULL
       LIMIT 1`,
      [chatId]
    );

    if (existing.rows.length === 0) {
      return { success: false, error: 'No pending operation found or already expired' };
    }

    const result = await query(
      `UPDATE pending_operations SET consumed_at = NOW(), status = 'cancelled'
       WHERE id = $1 RETURNING id`,
      [existing.rows[0].id]
    );

    return { success: true, operation_id: result.rows[0].id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}