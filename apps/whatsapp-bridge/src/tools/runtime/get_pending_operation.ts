/**
 * get_pending_operation — Runtime implementation
 * Read-only: retrieves pending operation for a chat_id.
 */

import { query } from '../db.js';
import type { GetPendingOperationResult } from '../types.js';
import { validateNonEmpty } from '../errors.js';

interface PendingOperationRow {
  id: string;
  chat_id: string;
  operation_type: string;
  operation_data: unknown;
  expires_at: Date;
  created_at: Date;
}

export async function getPendingOperation(
  chatId: string
): Promise<GetPendingOperationResult> {
  try {
    validateNonEmpty(chatId, 'chat_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const result = await query<PendingOperationRow>(
      `SELECT id, chat_id, operation_type, operation_data, expires_at, created_at
       FROM pending_operations
       WHERE chat_id = $1 AND expires_at > NOW() AND consumed_at IS NULL
       LIMIT 1`,
      [chatId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'No pending operation found' };
    }

    const row = result.rows[0];
    return {
      success: true,
      operation: {
        id: row.id,
        chat_id: row.chat_id,
        operation_type: row.operation_type,
        operation_data: row.operation_data as Record<string, unknown>,
        expires_at: row.expires_at,
        created_at: row.created_at,
      },
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}