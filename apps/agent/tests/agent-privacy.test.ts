import { describe, expect, it } from "vitest";
import { WorkspaceAgent } from "../src/index";

type SqlState = { queries: string[]; bindings: unknown[][] };

function makeSql(): SqlState & { sql: { exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> } } {
  const state: SqlState = { queries: [], bindings: [] };
  const sql = {
    exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> {
      state.queries.push(query);
      state.bindings.push(bindings);
      if (query.startsWith("SELECT version FROM _agent_schema_migrations")) return [] as T[];
      if (query.startsWith("SELECT id FROM transcript_redaction")) return [] as T[];
      if (query.startsWith("SELECT id, content_json FROM messages")) return [] as T[];
      if (query.startsWith("SELECT id, payload_json FROM agent_actions")) return [] as T[];
      if (query.startsWith("SELECT id, input_json, output_json FROM turn_queue")) return [] as T[];
      if (query.startsWith("SELECT turn_id, event_id, payload_json FROM turn_events")) return [] as T[];
      if (query.startsWith("SELECT COUNT(*) AS count FROM turn_queue WHERE status = 'queued'")) return [{ count: 0 }] as T[];
      return [] as T[];
    },
  };
  return { ...state, sql };
}

function makeHistorySql(failOn?: string) {
  const state = { queries: [] as string[], deleted: false };
  const rows = {
    turns: [
      { id: "turn-a", intention_id: "intent-a", actor_id: "user-a", status: "completed", attempts: 1, token_budget: 1000, tokens_used: 4, input_json: JSON.stringify({ content: "alpha" }), output_json: JSON.stringify({ output: "answer-a" }) },
      { id: "turn-b", intention_id: "intent-b", actor_id: "user-b", status: "completed", attempts: 1, token_budget: 1000, tokens_used: 4, input_json: JSON.stringify({ content: "beta" }), output_json: JSON.stringify({ output: "answer-b" }) },
    ],
    messages: [
      { id: "turn-a", actor_id: "user-a", role: "user", content_json: JSON.stringify("alpha"), created_at: "now" },
      { id: "turn-a:assistant", actor_id: "agent", role: "assistant", content_json: JSON.stringify("answer-a"), created_at: "now" },
      { id: "turn-b", actor_id: "user-b", role: "user", content_json: JSON.stringify("beta"), created_at: "now" },
      { id: "turn-b:assistant", actor_id: "agent", role: "assistant", content_json: JSON.stringify("answer-b"), created_at: "now" },
    ],
    actions: [
      { id: "turn-a", actor_id: "user-a", action_type: "message.created", payload_json: JSON.stringify({ turnId: "turn-a" }), created_at: "now" },
      { id: "turn-a:assistant", actor_id: "agent", action_type: "assistant.created", payload_json: JSON.stringify({ turnId: "turn-a" }), created_at: "now" },
    ],
    events: [{ turn_id: "turn-a", event_id: 1, event_type: "completed", payload_json: JSON.stringify({ status: "completed" }), created_at: "now" }],
    access: [{ id: 1, actor_id: "user-a", action: "history_export", record_count: 4, created_at: "now" }],
  };
  const sql = {
    exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> {
      state.queries.push(query);
      if (failOn && query.startsWith(failOn)) throw new Error("simulated sqlite failure");
      if (query.startsWith("SELECT version FROM _agent_schema_migrations")) return [] as T[];
      if (query.startsWith("SELECT id FROM transcript_redaction")) return [] as T[];
      if (query.startsWith("SELECT id, content_json FROM messages")) return [] as T[];
      if (query.startsWith("SELECT id, payload_json FROM agent_actions")) return [] as T[];
      if (query.startsWith("SELECT id, input_json, output_json FROM turn_queue")) return [] as T[];
      if (query.startsWith("SELECT turn_id, event_id, payload_json FROM turn_events")) return [] as T[];
      if (query.startsWith("SELECT id, intention_id, status, actor_id")) return state.deleted ? [] as T[] : rows.turns.filter((row) => row.actor_id === bindings[0]) as unknown as T[];
      if (query.startsWith("SELECT id, actor_id, role, content_json")) return state.deleted ? [] as T[] : rows.messages as unknown as T[];
      if (query.startsWith("SELECT id, actor_id, action_type, payload_json")) return state.deleted ? [] as T[] : rows.actions as unknown as T[];
      if (query.startsWith("SELECT turn_id, event_id, event_type, payload_json")) return rows.events as unknown as T[];
      if (query.startsWith("SELECT id, actor_id, action, record_count, created_at")) return rows.access.filter((row) => query.includes("actor_id = ?") ? row.actor_id === bindings[0] : true) as unknown as T[];
      if (query.startsWith("SELECT COUNT(*) AS count FROM turn_queue WHERE status = 'queued'")) return [{ count: 0 }] as T[];
      if (query.startsWith("DELETE FROM") || query.startsWith("INSERT INTO access_log")) {
        if (query.startsWith("DELETE FROM turn_queue")) state.deleted = true;
        return [] as T[];
      }
      return [] as T[];
    },
  };
  return { state, sql };
}

describe("G5.2.9 Agent privacy controls", () => {
  it("purges records older than 180 days without deleting active turns", async () => {
    const state = makeSql();
    const agent = new WorkspaceAgent({ storage: { sql: state.sql, setAlarm: async () => undefined } }, { AGENT_DELEGATION_SECRET: "secret" });

    await agent.alarm();

    expect(state.queries.some((query) => query.includes("DELETE FROM messages"))).toBe(true);
    expect(state.queries.some((query) => query.includes("DELETE FROM agent_actions"))).toBe(true);
    expect(state.queries.some((query) => query.includes("DELETE FROM turn_events"))).toBe(true);
    expect(state.queries.some((query) => query.includes("DELETE FROM token_usage"))).toBe(true);
    expect(state.queries.some((query) => query.includes("DELETE FROM access_log"))).toBe(true);
    expect(state.queries.some((query) => query.includes("status IN ('completed', 'failed', 'aborted')"))).toBe(true);
    expect(state.queries.some((query) => query.includes("DELETE FROM turn_queue") && query.includes("status IN ('queued', 'running')"))).toBe(false);
  });

  it("schedules the next retention alarm even when the workspace is inactive", async () => {
    const state = makeSql();
    const alarms: number[] = [];
    const agent = new WorkspaceAgent({ storage: { sql: state.sql, setAlarm: async (time) => { alarms.push(time); } } }, { AGENT_DELEGATION_SECRET: "secret" });
    await agent.alarm();
    expect(alarms.at(-1)).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1_000);
  });

  it("rolls back history deletion when a delete statement fails", async () => {
    const { state, sql } = makeHistorySql("DELETE FROM messages");
    const agent = new WorkspaceAgent({ storage: { sql } }, { AGENT_DELEGATION_SECRET: "secret" });
    const response = await agent.fetch(new Request("https://agent.test/history", { method: "DELETE", headers: { "x-agent-actor": "user-a", "x-agent-role": "member" } }));
    expect(response.status).toBe(500);
    expect(state.queries).toContain("BEGIN");
    expect(state.queries).toContain("ROLLBACK");
    expect(state.queries).not.toContain("COMMIT");
  });

  it("exports only the requesting actor's complete turn graph", async () => {
    const { sql } = makeHistorySql();
    const agent = new WorkspaceAgent({ storage: { sql } }, { AGENT_DELEGATION_SECRET: "secret" });
    const response = await agent.fetch(new Request("https://agent.test/history/export", { headers: { "x-agent-actor": "user-a", "x-agent-role": "member" } }));
    const body = await response.json() as { version: number; turns: Array<{ id: string }>; messages: Array<{ id: string }>; events: Array<{ turn_id: string }> };
    expect(response.status).toBe(200);
    expect(body.version).toBe(1);
    expect(body.turns.map((turn) => turn.id)).toEqual(["turn-a"]);
    expect(body.messages.map((message) => message.id)).toEqual(["turn-a", "turn-a:assistant"]);
    expect(body.events.map((event) => event.turn_id)).toEqual(["turn-a"]);
  });

  it("deletes only owned history and is idempotent", async () => {
    const { state, sql } = makeHistorySql();
    const agent = new WorkspaceAgent({ storage: { sql } }, { AGENT_DELEGATION_SECRET: "secret" });
    const request = () => agent.fetch(new Request("https://agent.test/history", { method: "DELETE", headers: { "x-agent-actor": "user-a", "x-agent-role": "member" } }));
    const first = await request();
    const second = await request();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(state.deleted).toBe(true);
    expect(state.queries.filter((query) => query.startsWith("DELETE FROM turn_queue")).length).toBe(1);
  });

  it("stores metadata instead of duplicating message content in actions", async () => {
    const state = makeSql();
    const agent = new WorkspaceAgent({ storage: { sql: state.sql } }, { AGENT_DELEGATION_SECRET: "secret" });
    await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "private transcript" }) }));
    const actionIndex = state.queries.findIndex((query) => query.startsWith("INSERT INTO agent_actions"));
    const payload = JSON.parse(String(state.bindings[actionIndex]?.[3])) as { content?: string; contentLength?: number };
    expect(payload.content).toBeUndefined();
    expect(payload.contentLength).toBeGreaterThan(0);
  });

  it("limits member access-log reads and allows owner workspace reads", async () => {
    const { sql } = makeHistorySql();
    const agent = new WorkspaceAgent({ storage: { sql } }, { AGENT_DELEGATION_SECRET: "secret" });
    const member = await agent.fetch(new Request("https://agent.test/history/access-log", { headers: { "x-agent-actor": "user-a", "x-agent-role": "member" } }));
    const owner = await agent.fetch(new Request("https://agent.test/history/access-log", { headers: { "x-agent-actor": "owner-a", "x-agent-role": "owner" } }));
    expect(member.status).toBe(200);
    expect(owner.status).toBe(200);
    expect((await member.json()).items).toHaveLength(1);
    expect((await owner.json()).items).toHaveLength(1);
  });
});
