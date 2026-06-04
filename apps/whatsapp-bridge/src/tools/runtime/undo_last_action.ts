/**
 * undo_last_action — Runtime implementation
 * Reverts the last action for a household (create/update/delete transaction).
 * Only transactions are eligible for undo (not accounts/categories).
 */

import { query } from '../db.js';
import type { UndoLastActionResult } from '../types.js';
import { validateUUID, validateNonEmpty } from '../errors.js';

export async function undoLastAction(
  chatId: string,
  householdId: string
): Promise<UndoLastActionResult> {
  try {
    validateNonEmpty(chatId, 'chat_id');
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const lastLog = await query(
      `SELECT id, action, entity_type, entity_id, before_json, after_json
       FROM audit_logs
       WHERE household_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [householdId]
    );

    if (lastLog.rows.length === 0) {
      return { success: false, error: 'No action found to undo' };
    }

    const log = lastLog.rows[0];

    if (log.entity_type !== 'transaction') {
      return { success: false, error: `Cannot undo ${log.entity_type} actions` };
    }

    switch (log.action) {
      case 'create': {
        const result = await query(
          `UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id`,
          [log.entity_id, householdId]
        );
        if (result.rows.length === 0) {
          return { success: false, error: 'Transaction not found or already deleted' };
        }
        return { success: true, undone_action: 'create', entity_id: result.rows[0].id };
      }

      case 'delete': {
        const result = await query(
          `UPDATE transactions SET deleted_at = NULL WHERE id = $1 AND household_id = $2 RETURNING id`,
          [log.entity_id, householdId]
        );
        if (result.rows.length === 0) {
          return { success: false, error: 'Transaction not found or already active' };
        }
        return { success: true, undone_action: 'delete', entity_id: result.rows[0].id };
      }

      case 'update': {
        const before = log.before_json as Record<string, unknown> | null;
        if (!before) {
          return { success: false, error: 'No before_json found for update' };
        }

        const setClauses: string[] = ['updated_at = NOW()', 'deleted_at = NULL'];
        const params: unknown[] = [];
        let i = 1;

        if (before.description !== undefined) {
          setClauses.push(`description = $${i++}`);
          params.push(before.description);
        }
        if (before.amount_cents !== undefined) {
          setClauses.push(`amount_cents = $${i++}`);
          params.push(before.amount_cents);
        }
        if (before.date !== undefined) {
          setClauses.push(`date = $${i++}`);
          params.push(before.date);
        }
        if (before.category_id !== undefined) {
          setClauses.push(`category_id = $${i++}`);
          params.push(before.category_id);
        }
        if (before.from_account_id !== undefined) {
          setClauses.push(`from_account_id = $${i++}`);
          params.push(before.from_account_id);
        }
        if (before.to_account_id !== undefined) {
          setClauses.push(`to_account_id = $${i++}`);
          params.push(before.to_account_id);
        }

        params.push(log.entity_id, householdId);

        const result = await query(
          `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${i++} AND household_id = $${i} AND deleted_at IS NULL RETURNING id`,
          params
        );

        if (result.rows.length === 0) {
          return { success: false, error: 'Transaction not found or already deleted' };
        }
        return { success: true, undone_action: 'update', entity_id: result.rows[0].id };
      }

      default:
        return { success: false, error: `Cannot undo action type: ${log.action}` };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}