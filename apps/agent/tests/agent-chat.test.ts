import { describe, expect, it } from "vitest";
import { WorkspaceAgent } from "../src/index";

type Row = { id: string; actor_id: string; role: string; content_json: string; created_at: string };

function makeAgent(): { agent: WorkspaceAgent; messages: Row[]; actions: string[] } {
  const messages: Row[] = [];
  const actions: string[] = [];
  const sql = {
    exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> {
      if (query.startsWith("SELECT version")) return [] as T[];
      if (query.startsWith("SELECT id, actor_id")) return messages as T[];
      if (query.startsWith("INSERT INTO agent_actions")) actions.push(String(bindings[2]));
      if (query.startsWith("INSERT INTO messages")) {
        messages.push({ id: String(bindings[0]), actor_id: String(bindings[1]), role: String(bindings[2]), content_json: String(bindings[3]), created_at: "now" });
      }
      return [] as T[];
    },
  };
  return { agent: new WorkspaceAgent({ storage: { sql } }), messages, actions };
}

describe("WorkspaceAgent transcript", () => {
  it("requires an authenticated actor and shares history between authorized actors", async () => {
    const { agent, messages, actions } = makeAgent();
    const denied = await agent.fetch(new Request("https://agent.test/agents/workspace/shared/message", { method: "POST", body: JSON.stringify({ content: "secret" }) }));
    expect(denied.status).toBe(401);

    const first = await agent.fetch(new Request("https://agent.test/agents/workspace/shared/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "hello" }) }));
    const second = await agent.fetch(new Request("https://agent.test/agents/workspace/shared/message", { method: "POST", headers: { "x-agent-actor": "user-b" }, body: JSON.stringify({ content: "world" }) }));
    const history = await agent.fetch(new Request("https://agent.test/agents/workspace/shared/message", { headers: { "x-agent-actor": "user-a" } }));

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(messages).toHaveLength(2);
    expect(actions).toEqual(["message.created", "message.created"]);
    expect((await history.json()).items).toHaveLength(2);
  });

  it("keeps separate Durable Object instances isolated for personal workspaces", async () => {
    const left = makeAgent();
    const right = makeAgent();
    await left.agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "owner-a" }, body: JSON.stringify({ content: "private" }) }));
    const history = await right.agent.fetch(new Request("https://agent.test/message", { headers: { "x-agent-actor": "owner-b" } }));
    expect((await history.json()).items).toEqual([]);
  });
});
