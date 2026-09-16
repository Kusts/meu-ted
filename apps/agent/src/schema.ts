import { redactTranscriptJson } from "./transcript-safety";

export type SqlExecutor = { exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> };

// V4 (ADR-016): the legacy V1 agent SQLite schema constants and their
// bootstrapper were removed here. They had zero live callers (FinanceChatAgent
// boots via the modular initializers in agent-config/memory,
// safety/usage-policy and mutations/mutation-draft, and the v1 tables are
// created by apps/agent/migrations/0001_workspace_agent.sql).
// backfillTranscript() below is kept: it is caller-agnostic redaction
// maintenance over the transcript-bearing tables with live test coverage.

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
