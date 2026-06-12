/**
 * confirm_pending_operation — Runtime implementation
 * Marks pending operation as confirmed and executes it (creates the transaction).
 * The operation_data contains the transaction parameters.
 */

import { query } from '../db.js';
import type { ConfirmPendingOperationResult } from '../types.js';
import { validateNonEmpty } from '../errors.js';

interface PendingOpRow {
  id: string;
  kind: string;
  operation_data: unknown;
  from_account_id: string | null;
  to_account_id: string | null;
  category_id: string | null;
  amount_cents: number;
  description: string;
  date: Date;
}

interface TransactionRow {
  id: string;
}

export async function confirmPendingOperation(
  chatId: string,
  householdId: string
): Promise<ConfirmPendingOperationResult> {
  try {
    validateNonEmpty(chatId, 'chat_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const existing = await query<PendingOpRow>(
      `SELECT id, kind, operation_data, from_account_id, to_account_id, category_id, amount_cents, description, date
       FROM pending_operations
       WHERE chat_id = $1 AND expires_at > NOW() AND consumed_at IS NULL
       LIMIT 1`,
      [chatId]
    );

    if (existing.rows.length === 0) {
      return { success: false, error: 'No pending operation found or already expired' };
    }

    const pending = existing.rows[0];

    const result = await query<TransactionRow>(
      `INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, to_account_id, date, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'confirmed', NOW())
       RETURNING id`,
      [
        householdId,
        pending.kind,
        pending.amount_cents,
        pending.description,
        pending.category_id,
        pending.from_account_id,
        pending.to_account_id,
        pending.date,
      ]
    );

    await query(
      `UPDATE pending_operations SET consumed_at = NOW(), status = 'confirmed' WHERE id = $1`,
      [pending.id]
    );

    return {
      success: true,
      operation_id: pending.id,
      result: { success: true, message: 'Operation executed', transaction_id: result.rows[0].id },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}