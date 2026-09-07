/**
 * Past sessions registry (Part B, item 15): `agent_sessions` tracks one row
 * per chat session so the model can list/resume earlier context and a fresh
 * session starts clean without losing history. Rows are scoped by
 * (workspace_id, actor_id) — never expose another workspace's or actor's
 * sessions.
 */

import { randomUUID } from 'node:crypto';
import { scrubForPersistence } from '../../privacy/dlp.js';
import type { MemorySql } from './store.js';

export type ChatSession = {
  id: string;
  workspaceId: string;
  actorId: string;
  startedAt: string;
  endedAt: string | null;
  messageCount: number;
  summary: string | null;
};

const nowIso = (): string => new Date().toISOString();

export const initializeSessionSchema = (sql: MemorySql): void => {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      actor_id TEXT NOT NULL DEFAULT '',
      started_at TEXT NOT NULL,
      ended_at TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      summary TEXT
    );
  `);
  sql.exec(`CREATE INDEX IF NOT EXISTS agent_sessions_workspace_idx ON agent_sessions (workspace_id, actor_id);`);
};

const mapRow = (row: Record<string, unknown>): ChatSession => ({
  id: String(row['id']),
  workspaceId: String(row['workspace_id']),
  actorId: String(row['actor_id'] ?? ''),
  startedAt: String(row['started_at']),
  endedAt: row['ended_at'] == null ? null : String(row['ended_at']),
  messageCount: Number(row['message_count'] ?? 0),
  summary: row['summary'] == null ? null : String(row['summary']),
});

export const currentSession = (sql: MemorySql, workspaceId: string, actorId: string): ChatSession => {
  const open = [
    ...sql.exec<Record<string, unknown>>(
      `SELECT * FROM agent_sessions WHERE workspace_id = ? AND actor_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      workspaceId,
      actorId,
    ),
  ].map(mapRow);
  if (open[0]) return open[0];
  const session: ChatSession = {
    id: randomUUID(),
    workspaceId,
    actorId,
    startedAt: nowIso(),
    endedAt: null,
    messageCount: 0,
    summary: null,
  };
  sql.exec(
    `INSERT INTO agent_sessions (id, workspace_id, actor_id, started_at, ended_at, message_count, summary)
     VALUES (?, ?, ?, ?, NULL, 0, NULL)`,
    session.id,
    session.workspaceId,
    session.actorId,
    session.startedAt,
  );
  return session;
};

export const endSession = (
  sql: MemorySql,
  workspaceId: string,
  actorId: string,
  input?: { summary?: string | null; messageCount?: number },
): ChatSession | null => {
  const current = [
    ...sql.exec<Record<string, unknown>>(
      `SELECT * FROM agent_sessions WHERE workspace_id = ? AND actor_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
      workspaceId,
      actorId,
    ),
  ].map(mapRow)[0];
  if (!current) return null;
  const closed: ChatSession = {
    ...current,
    endedAt: nowIso(),
    messageCount: input?.messageCount ?? current.messageCount,
    // H-09: session summaries are durable — scrub before persisting.
    summary: input?.summary ? scrubForPersistence(input.summary) : current.summary,
  };
  sql.exec(`UPDATE agent_sessions SET ended_at = ?, message_count = ?, summary = ? WHERE id = ?`, closed.endedAt, closed.messageCount, closed.summary, current.id);
  return closed;
};

export const listPastSessions = (sql: MemorySql, workspaceId: string, actorId: string, limit = 5): ChatSession[] => {
  const capped = Math.min(Math.max(limit, 1), 20);
  return [
    ...sql.exec<Record<string, unknown>>(
      `SELECT * FROM agent_sessions WHERE workspace_id = ? AND actor_id = ? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT ?`,
      workspaceId,
      actorId,
      capped,
    ),
  ].map(mapRow);
};

export const getSessionSummary = (sql: MemorySql, workspaceId: string, actorId: string, sessionId: string): ChatSession | null => {
  const rows = [
    ...sql.exec<Record<string, unknown>>(
      `SELECT * FROM agent_sessions WHERE id = ? AND workspace_id = ? AND actor_id = ?`,
      sessionId,
      workspaceId,
      actorId,
    ),
  ].map(mapRow);
  return rows[0] ?? null;
};
