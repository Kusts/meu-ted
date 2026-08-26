import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { WorkspaceAgent } from "../src/index";

type SqliteAdapter = {
  db: DatabaseSync;
  sql: { exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> };
};

function createSqlite(): SqliteAdapter {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> {
        const statement = db.prepare(query);
        if (/^\s*(SELECT|PRAGMA|WITH)/i.test(query)) return statement.all(...bindings as any[]) as T[];
        statement.run(...bindings as any[]);
        return [] as T[];
      },
    },
  };
}

describe("G5.2.9 real SQLite privacy semantics", () => {
  it("deletes only one actor's history and rolls back on a SQLite failure", async () => {
    const { db, sql } = createSqlite();
    const agent = new WorkspaceAgent({ storage: { sql, setAlarm: async () => undefined } }, { AGENT_DELEGATION_SECRET: "secret" });
    db.exec("INSERT INTO turn_queue (id, actor_id, input_json, status) VALUES ('turn-a', 'user-a', '{}', 'completed'), ('turn-b', 'user-b', '{}', 'completed')");
    db.exec("INSERT INTO messages (id, actor_id, role, content_json) VALUES ('turn-a', 'user-a', 'user', '\"a\"'), ('turn-b', 'user-b', 'user', '\"b\"')");

    const deleted = await agent.fetch(new Request("https://agent.test/history", { method: "DELETE", headers: { "x-agent-actor": "user-a", "x-agent-role": "member" } }));
    expect(deleted.status).toBe(200);
    expect((db.prepare("SELECT COUNT(*) AS count FROM turn_queue WHERE actor_id = 'user-a'").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS count FROM turn_queue WHERE actor_id = 'user-b'").get() as { count: number }).count).toBe(1);

    db.exec("INSERT INTO turn_queue (id, actor_id, input_json, status) VALUES ('turn-c', 'user-a', '{}', 'completed')");
    db.exec("INSERT INTO messages (id, actor_id, role, content_json) VALUES ('turn-c', 'user-a', 'user', '\"c\"')");
    db.exec("CREATE TRIGGER fail_privacy_delete BEFORE DELETE ON messages WHEN OLD.id = 'turn-c' BEGIN SELECT RAISE(ABORT, 'privacy delete failure'); END");
    const failed = await agent.fetch(new Request("https://agent.test/history", { method: "DELETE", headers: { "x-agent-actor": "user-a", "x-agent-role": "member" } }));
    expect(failed.status).toBe(500);
    expect((db.prepare("SELECT COUNT(*) AS count FROM turn_queue WHERE id = 'turn-c'").get() as { count: number }).count).toBe(1);
  });

  it("purges terminal data, preserves active data, and creates access-log indexes", async () => {
    const { db, sql } = createSqlite();
    const agent = new WorkspaceAgent({ storage: { sql, setAlarm: async () => undefined } }, { AGENT_DELEGATION_SECRET: "secret" });
    db.exec("INSERT INTO turn_queue (id, actor_id, input_json, status, updated_at) VALUES ('old-turn', 'user-a', '{}', 'completed', '2000-01-01')");
    db.exec("INSERT INTO turn_queue (id, actor_id, input_json, status, lease_until, updated_at) VALUES ('active-turn', 'user-a', '{}', 'running', '2999-01-01', '2000-01-01')");
    db.exec("INSERT INTO messages (id, actor_id, role, content_json, created_at) VALUES ('old-turn', 'user-a', 'user', '\"old\"', '2000-01-01'), ('active-turn', 'user-a', 'user', '\"active\"', '2000-01-01')");
    db.exec("INSERT INTO agent_actions (id, actor_id, action_type, payload_json, created_at) VALUES ('old-turn', 'user-a', 'message.created', '{}', '2000-01-01'), ('active-turn', 'user-a', 'message.created', '{}', '2000-01-01')");
    db.exec("INSERT INTO turn_events (turn_id, event_id, event_type, payload_json, created_at) VALUES ('old-turn', 1, 'completed', '{}', '2000-01-01'), ('active-turn', 1, 'running', '{}', '2000-01-01')");
    db.exec("INSERT INTO token_usage (turn_id, input_tokens, total_tokens, updated_at) VALUES ('old-turn', 1, 1, '2000-01-01'), ('active-turn', 1, 1, '2000-01-01')");
    db.exec("INSERT INTO access_log (actor_id, action, record_count, created_at) VALUES ('user-a', 'history_export', 1, '2000-01-01')");

    await agent.alarm();

    expect((db.prepare("SELECT COUNT(*) AS count FROM turn_queue WHERE id = 'old-turn'").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS count FROM messages WHERE id = 'old-turn'").get() as { count: number }).count).toBe(0);
    expect((db.prepare("SELECT COUNT(*) AS count FROM turn_queue WHERE id = 'active-turn'").get() as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS count FROM messages WHERE id = 'active-turn'").get() as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS count FROM access_log WHERE created_at = '2000-01-01'").get() as { count: number }).count).toBe(0);

    const indexes = db.prepare("PRAGMA index_list('access_log')").all() as Array<{ name: string }>;
    expect(indexes.map((index) => index.name)).toEqual(expect.arrayContaining(["access_log_actor_created_idx", "access_log_created_idx"]));
    const columns = db.prepare("PRAGMA table_info('access_log')").all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("payload_json");
  });
});
