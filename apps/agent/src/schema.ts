import { redactTranscriptJson } from "./transcript-safety";

export type SqlExecutor = { exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> };

export const WORKSPACE_AGENT_SCHEMA_VERSION = 5;

export const WORKSPACE_AGENT_SCHEMA_V1 = [
  `CREATE TABLE IF NOT EXISTS agent_state (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at)",
  "CREATE INDEX IF NOT EXISTS messages_actor_id_idx ON messages(actor_id)",
  `CREATE TABLE IF NOT EXISTS agent_actions (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS agent_actions_actor_id_idx ON agent_actions(actor_id)",
  `CREATE TABLE IF NOT EXISTS turn_queue (
    id TEXT PRIMARY KEY NOT NULL,
    actor_id TEXT NOT NULL,
    input_json TEXT NOT NULL,
    output_json TEXT,
    status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'aborted')),
    attempts INTEGER NOT NULL DEFAULT 0,
    token_budget INTEGER NOT NULL DEFAULT 1000,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    lease_until TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS turn_queue_status_idx ON turn_queue(status, updated_at)",
  `CREATE TABLE IF NOT EXISTS token_usage (
    turn_id TEXT PRIMARY KEY NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS turn_events (
    turn_id TEXT NOT NULL,
    event_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (turn_id, event_id)
  )`,
] as const;

export const WORKSPACE_AGENT_SCHEMA_V2 = [
  "ALTER TABLE turn_queue ADD COLUMN intention_id TEXT",
  "UPDATE turn_queue SET intention_id = id WHERE intention_id IS NULL",
  "CREATE INDEX IF NOT EXISTS turn_queue_intention_id_idx ON turn_queue(intention_id)",
] as const;

export const WORKSPACE_AGENT_SCHEMA_V3 = [
  `CREATE TABLE IF NOT EXISTS daily_token_usage (
    actor_id TEXT NOT NULL,
    usage_day TEXT NOT NULL,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (actor_id, usage_day)
  )`,
  `CREATE TABLE IF NOT EXISTS agent_rate_limits (
    actor_id TEXT PRIMARY KEY NOT NULL,
    window_started_at INTEGER NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0
  )`,
] as const;

export const WORKSPACE_AGENT_SCHEMA_V4 = [
  `CREATE TABLE IF NOT EXISTS transcript_redaction (
    id INTEGER PRIMARY KEY CHECK (id = 1)
  )`,
] as const;

export const WORKSPACE_AGENT_SCHEMA_V5 = [
  `CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('history_export', 'history_delete', 'access_log_read', 'retention_purge')),
    record_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  "CREATE INDEX IF NOT EXISTS access_log_actor_created_idx ON access_log(actor_id, created_at)",
  "CREATE INDEX IF NOT EXISTS access_log_created_idx ON access_log(created_at)",
] as const;

export function backfillTranscript(sql: SqlExecutor): void {
  const completed = [...sql.exec<{ id: number }>("SELECT id FROM transcript_redaction WHERE id = 1")];
  if (completed.length > 0) return;

  for (const row of sql.exec<{ id: string; content_json: string }>("SELECT id, content_json FROM messages")) {
    sql.exec("UPDATE messages SET content_json = ? WHERE id = ?", redactTranscriptJson(row.content_json), row.id);
  }
  for (const row of sql.exec<{ id: string; payload_json: string }>("SELECT id, payload_json FROM agent_actions")) {
    sql.exec("UPDATE agent_actions SET payload_json = ? WHERE id = ?", redactTranscriptJson(row.payload_json), row.id);
  }
  for (const row of sql.exec<{ id: string; input_json: string; output_json?: string }>("SELECT id, input_json, output_json FROM turn_queue")) {
    sql.exec("UPDATE turn_queue SET input_json = ?, output_json = ? WHERE id = ?", redactTranscriptJson(row.input_json), row.output_json ? redactTranscriptJson(row.output_json) : null, row.id);
  }
  for (const row of sql.exec<{ turn_id: string; event_id: number; payload_json: string }>("SELECT turn_id, event_id, payload_json FROM turn_events")) {
    sql.exec("UPDATE turn_events SET payload_json = ? WHERE turn_id = ? AND event_id = ?", redactTranscriptJson(row.payload_json), row.turn_id, row.event_id);
  }
  sql.exec("INSERT OR IGNORE INTO transcript_redaction (id) VALUES (1)");
}

export function initializeWorkspaceAgentSchema(sql: SqlExecutor): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS _agent_schema_migrations (
    version INTEGER PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const appliedRows = sql.exec("SELECT version FROM _agent_schema_migrations") as Iterable<{ version: number }>;
  const applied = new Set([...appliedRows].map((row) => row.version));
  if (!applied.has(1)) {
    for (const statement of WORKSPACE_AGENT_SCHEMA_V1) sql.exec(statement);
    sql.exec("INSERT INTO _agent_schema_migrations (version) VALUES (1)");
  }
  if (!applied.has(2)) {
    for (const statement of WORKSPACE_AGENT_SCHEMA_V2) sql.exec(statement);
    sql.exec("INSERT INTO _agent_schema_migrations (version) VALUES (2)");
  }
  if (!applied.has(3)) {
    for (const statement of WORKSPACE_AGENT_SCHEMA_V3) sql.exec(statement);
    sql.exec("INSERT INTO _agent_schema_migrations (version) VALUES (3)");
  }
  if (!applied.has(4)) {
    for (const statement of WORKSPACE_AGENT_SCHEMA_V4) sql.exec(statement);
    sql.exec("INSERT INTO _agent_schema_migrations (version) VALUES (4)");
  }
  if (!applied.has(WORKSPACE_AGENT_SCHEMA_VERSION)) {
    for (const statement of WORKSPACE_AGENT_SCHEMA_V5) sql.exec(statement);
    sql.exec(`INSERT INTO _agent_schema_migrations (version) VALUES (${WORKSPACE_AGENT_SCHEMA_VERSION})`);
  }
  backfillTranscript(sql);
}
