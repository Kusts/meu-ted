import { createHash } from 'node:crypto';
import { sanitizeForPersistence } from '../privacy/history.js';

export type LegacyMessage = {
  id: string;
  actor_id: string;
  role: string;
  content_json: string;
  created_at: string;
};

export type LegacyTurn = {
  id: string;
  intention_id?: string;
  actor_id: string;
  status: string;
  attempts: number;
  tokens_used: number;
  input_json?: string;
  output_json?: string;
};

export type LegacyFullExport = {
  version: number;
  workspaceId: string;
  turns: LegacyTurn[];
  messages: LegacyMessage[];
  hasInFlightTurns: boolean;
};

export type TransformedMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actorId: string;
  createdAt: string;
};

export type MigrationResult = {
  success: boolean;
  importedCount: number;
  skipped: boolean;
  reason?: string;
  migrationHash?: string;
};

export const computeHistoryHash = (messages: LegacyMessage[]): string => {
  const normalized = messages.map((m) => `${m.id}:${m.actor_id}:${m.role}:${m.created_at}`).join('|');
  return createHash('sha256').update(normalized).digest('hex');
};

export const transformLegacyMessages = (messages: LegacyMessage[]): TransformedMessage[] => {
  return messages.map((msg) => {
    let parsedContent = '';
    try {
      const parsed = JSON.parse(msg.content_json);
      parsedContent = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
    } catch {
      parsedContent = msg.content_json;
    }

    const sanitized = sanitizeForPersistence(parsedContent);
    const validRole: 'user' | 'assistant' | 'system' =
      msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user';

    return {
      id: msg.id,
      role: validRole,
      content: sanitized,
      actorId: msg.actor_id,
      createdAt: msg.created_at,
    };
  });
};

export const initializeMigrationSchema = (sql: { exec(query: string): unknown }): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS _history_migration_marker (
      workspace_id TEXT PRIMARY KEY,
      migration_hash TEXT NOT NULL,
      imported_count INTEGER NOT NULL,
      migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS migrated_messages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
};

export const migrateLegacyHistory = (
  exportData: LegacyFullExport,
  sql: { exec<T = Record<string, unknown>>(query: string, ...params: unknown[]): Iterable<T> },
): MigrationResult => {
  if (exportData.hasInFlightTurns) {
    return {
      success: false,
      importedCount: 0,
      skipped: false,
      reason: 'migration_blocked_turns_in_flight: workspace has active turns in queued/running state',
    };
  }

  initializeMigrationSchema(sql);

  const migrationHash = computeHistoryHash(exportData.messages);

  // Check if already migrated
  const existing = [...sql.exec<{ migration_hash: string; imported_count: number }>(
    `SELECT migration_hash, imported_count FROM _history_migration_marker WHERE workspace_id = ?`,
    exportData.workspaceId,
  )];

  if (existing.length > 0 && existing[0]?.migration_hash === migrationHash) {
    return {
      success: true,
      importedCount: existing[0].imported_count,
      skipped: true,
      migrationHash,
      reason: 'already_migrated',
    };
  }

  const transformed = transformLegacyMessages(exportData.messages);

  // Save messages atomically
  for (const msg of transformed) {
    sql.exec(
      `INSERT INTO migrated_messages (id, workspace_id, actor_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET content = excluded.content`,
      msg.id,
      exportData.workspaceId,
      msg.actorId,
      msg.role,
      msg.content,
      msg.createdAt,
    );
  }

  sql.exec(
    `INSERT INTO _history_migration_marker (workspace_id, migration_hash, imported_count, migrated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT (workspace_id) DO UPDATE SET migration_hash = excluded.migration_hash, imported_count = excluded.imported_count, migrated_at = CURRENT_TIMESTAMP`,
    exportData.workspaceId,
    migrationHash,
    transformed.length,
  );

  return {
    success: true,
    importedCount: transformed.length,
    skipped: false,
    migrationHash,
  };
};
