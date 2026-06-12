/**
 * audit_logs — Runtime implementation
 * Read-only: retrieves audit log entries for a household.
 */

import { query } from '../db.js';
import type { AuditLogsResult } from '../types.js';
import { validateUUID } from '../errors.js';

interface AuditLogRow {
  id: string;
  household_id: string;
  chat_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: unknown;
  created_at: Date;
}

export async function auditLogs(
  householdId: string,
  limit: number = 50
): Promise<AuditLogsResult> {
  try {
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error', logs: [], count: 0 };
  }

  try {
    const result = await query<AuditLogRow>(
      `SELECT id, household_id, chat_id, action, entity_type, entity_id,
              details, created_at
       FROM audit_logs
       WHERE household_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [householdId, Math.min(limit, 100)]
    );

    return {
      success: true,
      logs: result.rows.map(row => ({
        id: row.id,
        household_id: row.household_id,
        chat_id: row.chat_id,
        action: row.action,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        details: row.details as Record<string, unknown> | null,
        created_at: row.created_at,
      })),
      count: result.rows.length,
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error', logs: [], count: 0 };
  }
}