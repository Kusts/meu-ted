import { createHash } from 'node:crypto';

export type IntentionLedgerEntry = {
  key: string;
  outcome?: unknown;
};

const memoryLedger = new Map<string, IntentionLedgerEntry>();

export const deriveIdempotencyKey = (
  workspaceId: string,
  intentionId: string,
  toolCallId: string,
): string => {
  const input = `${workspaceId}:${intentionId}:${toolCallId}`;
  return createHash('sha256').update(input).digest('hex');
};

export const initializeIntentionLedgerSchema = (sql: { exec(query: string): unknown }): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS intention_tool_ledger (
      workspace_id TEXT NOT NULL,
      intention_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      outcome_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, intention_id, tool_call_id)
    );
  `);
};

export const remember = (
  workspace: string,
  intentionId: string,
  toolCallId: string,
  key: string,
  outcome?: unknown,
  sql?: { exec(query: string, ...params: unknown[]): unknown },
): void => {
  const compositeKey = `${workspace}:${intentionId}:${toolCallId}`;
  memoryLedger.set(compositeKey, { key, outcome });

  if (sql) {
    try {
      sql.exec(
        `INSERT INTO intention_tool_ledger (workspace_id, intention_id, tool_call_id, idempotency_key, outcome_json, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (workspace_id, intention_id, tool_call_id)
         DO UPDATE SET outcome_json = excluded.outcome_json`,
        workspace,
        intentionId,
        toolCallId,
        key,
        outcome !== undefined ? JSON.stringify(outcome) : null,
      );
    } catch {
      // Ignored
    }
  }
};

export const recall = (
  workspace: string,
  intentionId: string,
  toolCallId: string,
  sql?: { exec<T = Record<string, unknown>>(query: string, ...params: unknown[]): Iterable<T> },
): IntentionLedgerEntry | undefined => {
  const compositeKey = `${workspace}:${intentionId}:${toolCallId}`;

  if (sql) {
    try {
      const rows = [...sql.exec<{ idempotency_key: string; outcome_json?: string | null }>(
        `SELECT idempotency_key, outcome_json FROM intention_tool_ledger
         WHERE workspace_id = ? AND intention_id = ? AND tool_call_id = ?`,
        workspace,
        intentionId,
        toolCallId,
      )];
      if (rows.length > 0 && rows[0]) {
        return {
          key: rows[0].idempotency_key,
          outcome: rows[0].outcome_json ? JSON.parse(rows[0].outcome_json) : undefined,
        };
      }
    } catch {
      // Fall back to memory
    }
  }

  return memoryLedger.get(compositeKey);
};

export const clearMemoryLedger = (): void => {
  memoryLedger.clear();
};
