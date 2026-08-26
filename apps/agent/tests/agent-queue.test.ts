import { describe, expect, it } from "vitest";
import { WorkspaceAgent } from "../src/index";
import { decodeDelegatedTurnToken } from "../src/delegated-token";

type Turn = { id: string; intention_id?: string; actor_id: string; status: string; attempts: number; input_json?: string; output_json?: string };
type Event = { turn_id: string; event_id: number; event_type: string; payload_json: string };

function makeAgent(seed?: Turn, delegationSecret?: string, seedEvents: Event[] = []): { agent: WorkspaceAgent; queries: string[]; bindings: unknown[][] } {
  const turns = new Map<string, Turn>();
  if (seed) turns.set(seed.id, seed);
  const events: Event[] = [...seedEvents];
  const queries: string[] = [];
  const bindingsSeen: unknown[][] = [];
  const sql = {
    exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> {
      queries.push(query);
      bindingsSeen.push(bindings);
      if (query.startsWith("SELECT version")) return [] as T[];
      if (query.startsWith("SELECT COALESCE")) {
        const turnId = String(bindings[0]);
        const next = Math.max(0, ...events.filter((event) => event.turn_id === turnId).map((event) => event.event_id)) + 1;
        return [{ next_event_id: next }] as T[];
      }
      if (query.startsWith("INSERT INTO turn_events")) {
        events.push({ turn_id: String(bindings[0]), event_id: Number(bindings[1]), event_type: String(bindings[2]), payload_json: String(bindings[3]) });
      }
      if (query.startsWith("SELECT event_id")) {
        const turnId = String(bindings[0]);
        const after = Number(bindings[1]);
        return events.filter((event) => event.turn_id === turnId && event.event_id > after) as T[];
      }
      if (query.startsWith("INSERT INTO turn_queue")) {
        turns.set(String(bindings[0]), { id: String(bindings[0]), intention_id: String(bindings[1]), actor_id: String(bindings[2]), status: "queued", attempts: 0, input_json: String(bindings[3]) });
      }
      if (query.includes("FROM turn_queue WHERE id = ?")) {
        const turn = turns.get(String(bindings[0]));
        return (turn ? [turn] : []) as T[];
      }
      if (query.includes("FROM turn_queue WHERE status = 'queued'")) {
        return [...turns.values()].filter((turn) => turn.status === "queued") as T[];
      }
      if (query.includes("SET status = 'queued'") && query.includes("attempts < 3")) {
        for (const turn of turns.values()) if (turn.status === "running" && turn.attempts < 3) turn.status = "queued";
      }
      if (query.includes("SET status = 'failed'") && query.includes("attempts >= 3")) {
        for (const turn of turns.values()) if (turn.status === "running" && turn.attempts >= 3) turn.status = "failed";
      }
      if (query.startsWith("UPDATE turn_queue SET status = 'queued'")) {
        const turn = turns.get(String(bindings[1]));
        if (turn) turn.status = "queued";
      }
      if (query.startsWith("UPDATE turn_queue SET status = 'running'")) {
        const turn = turns.get(String(bindings[0]));
        if (turn) { turn.status = "running"; turn.attempts += 1; }
      }
      if (query.startsWith("UPDATE turn_queue SET status = 'completed'")) {
        const turn = turns.get(String(bindings[2]));
        if (turn) { turn.status = "completed"; turn.output_json = String(bindings[0]); }
      }
      if (query.startsWith("UPDATE turn_queue SET status = 'aborted'")) {
        const turn = turns.get(String(bindings[0]));
        if (turn) turn.status = "aborted";
      }
      if (query.startsWith("UPDATE turn_queue SET status = ?")) {
        const turn = turns.get(String(bindings[1]));
        if (turn) turn.status = String(bindings[0]);
      }
      return [] as T[];
    },
  };
  return { agent: new WorkspaceAgent({ storage: { sql } }, { AGENT_DELEGATION_SECRET: delegationSecret ?? "test-secret" }), queries, bindings: bindingsSeen };
}

describe("WorkspaceAgent durable turn queue", () => {
  it("queues a turn, exposes resumable SSE status, and aborts it", async () => {
    const { agent } = makeAgent();
    const created = await agent.fetch(new Request("https://agent.test/message", {
      method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "process this" }),
    }));
    const body = await created.json() as { turnId: string; status: string };
    expect(created.status).toBe(202);
    expect(body.status).toBe("queued");

    const stream = await agent.fetch(new Request(`https://agent.test/message/stream/${body.turnId}`, {
      headers: { "x-agent-actor": "user-a", "last-event-id": "0" },
    }));
    expect(stream.status).toBe(200);
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    expect(await stream.text()).toContain("queued");

    const aborted = await agent.fetch(new Request(`https://agent.test/message/${body.turnId}/abort`, {
      method: "POST", headers: { "x-agent-actor": "user-a" },
    }));
    expect(aborted.status).toBe(200);
    expect((await aborted.json()).status).toBe("aborted");
  });

  it("claims and completes a queued turn, then streams persisted events by cursor", async () => {
    const { agent } = makeAgent();
    const created = await agent.fetch(new Request("https://agent.test/message", {
      method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "run" }),
    }));
    const { turnId } = await created.json() as { turnId: string };
    const processed = await agent.processTurn(turnId, "user-a");
    expect(processed.status).toBe(200);
    expect((await processed.json()).status).toBe("completed");
    const replay = await agent.fetch(new Request(`https://agent.test/message/stream/${turnId}`, { headers: { "x-agent-actor": "user-a", "last-event-id": "1" } }));
    expect(await replay.text()).toContain("completed");
  });

  it("returns persisted output when the alarm wins the process race", async () => {
    const { agent } = makeAgent();
    const created = await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "race" }) }));
    const { turnId } = await created.json() as { turnId: string };
    await agent.alarm();
    const process = await agent.fetch(new Request(`https://agent.test/message/${turnId}/process`, { method: "POST", headers: { "x-agent-actor": "user-a" } }));
    expect((await process.json()).output).toBe("race");
  });

  it("retries within the global attempt budget and rejects exhausted retries", async () => {
    const { agent } = makeAgent({ id: "retry", actor_id: "user-a", status: "failed", attempts: 2, input_json: JSON.stringify({ messageId: "retry", content: "run" }) });
    const retried = await agent.fetch(new Request("https://agent.test/message/retry/retry", { method: "POST", headers: { "x-agent-actor": "user-a" } }));
    expect(retried.status).toBe(200);
    expect((await retried.json()).attempts).toBe(2);
    expect((await agent.processTurn("retry", "user-a")).status).toBe(200);

    const exhausted = makeAgent({ id: "retry-exhausted", actor_id: "user-a", status: "failed", attempts: 3, input_json: JSON.stringify({ messageId: "retry-exhausted", content: "stop" }) });
    const rejected = await exhausted.agent.fetch(new Request("https://agent.test/message/retry-exhausted/retry", { method: "POST", headers: { "x-agent-actor": "user-a" } }));
    expect(rejected.status).toBe(409);
  });

  it("drains multiple queued turns from one Durable Object alarm", async () => {
    const { agent, queries } = makeAgent();
    for (const content of ["one", "two"]) await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content }) }));
    await agent.alarm();
    expect(queries.filter((query) => query.includes("status = 'completed'")).length).toBe(2);
  });

  it("enforces a persisted token budget for input and processor output", async () => {
    const { agent } = makeAgent();
    const oversized = await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "x".repeat(4001) }) }));
    expect(oversized.status).toBe(413);

    const created = await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "small" }) }));
    const { turnId } = await created.json() as { turnId: string };
    const overOutput = await agent.processTurn(turnId, "user-a", async () => "x".repeat(5000));
    expect(overOutput.status).toBe(429);
    expect((await overOutput.json()).reason).toBe("token_budget_exceeded");
  });

  it("fails closed when production delegation secret is missing", async () => {
    const { agent } = makeAgent(undefined, '');
    const created = await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "read accounts" }) }));
    const { turnId } = await created.json() as { turnId: string };
    const response = await agent.processTurn(turnId, "user-a");
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("agent.delegation_unavailable");
  });

  it("emits a five-minute delegated token only through the processor side channel", async () => {
    const { agent, bindings } = makeAgent(undefined, "test-secret");
    const created = await agent.fetch(new Request("https://agent.test/message", {
      method: "POST",
      headers: { "x-agent-actor": "user-a", "x-agent-role": "owner", "x-agent-workspace": "workspace-a" },
      body: JSON.stringify({ content: "read accounts" }),
    }));
    const { turnId } = await created.json() as { turnId: string };
    let delegatedToken: string | undefined;
    let processorInput: unknown;
    await agent.processTurn(turnId, "user-a", async (input, _signal, token) => { processorInput = input; delegatedToken = token; return "ok"; });
    expect(delegatedToken).toBeDefined();
    expect(JSON.stringify(processorInput)).not.toContain(delegatedToken!);
    expect(bindings.map((values) => JSON.stringify(values)).join("\n")).not.toContain(delegatedToken!);
    await expect(decodeDelegatedTurnToken(delegatedToken!, "test-secret")).resolves.toMatchObject({ workspace: "workspace-a", sub: "user-a", role: "owner", request: turnId, capabilities: ["financial.read", "financial.write"] });
  });

  it("rejects delegated tokens returned by a processor before transcript persistence", async () => {
    const { agent, bindings } = makeAgent(undefined, "test-secret");
    const created = await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "u" }, body: JSON.stringify({ content: "safe prompt" }) }));
    const { turnId } = await created.json() as { turnId: string };
    let delegatedToken = "";
    const response = await agent.processTurn(turnId, "u", async (_input, _signal, token) => { delegatedToken = token!; return token!; });
    expect(response.status).toBe(502);
    expect((await response.json()).code).toBe("agent.sensitive_output");
    const stream = await agent.fetch(new Request(`https://agent.test/message/stream/${turnId}`, { headers: { "x-agent-actor": "u" } }));
    expect(await stream.text()).not.toContain(delegatedToken);
    expect(bindings.map((values) => JSON.stringify(values)).join("\n")).not.toContain(delegatedToken);
  });

  it("redacts legacy queued input before passing it to the processor", async () => {
    const { agent } = makeAgent({
      id: "legacy-input", actor_id: "user-a", status: "queued", attempts: 0,
      input_json: JSON.stringify({ messageId: "legacy-input", content: "Authorization: Bearer legacy-secret" }),
    });
    let received = "";
    await agent.processTurn("legacy-input", "user-a", async (input) => { received = input.content; return "ok"; });
    expect(received).toContain("[REDACTED]");
    expect(received).not.toContain("legacy-secret");
  });

  it("redacts persisted event payloads before streaming them", async () => {
    const { agent } = makeAgent(
      { id: "legacy-event", actor_id: "user-a", status: "completed", attempts: 1, output_json: JSON.stringify({ output: "ok" }) },
      "test-secret",
      [{ turn_id: "legacy-event", event_id: 1, event_type: "completed", payload_json: JSON.stringify({ output: "Authorization: Bearer event-secret" }) }],
    );
    const stream = await agent.fetch(new Request("https://agent.test/message/stream/legacy-event", { headers: { "x-agent-actor": "user-a" } }));
    const body = await stream.text();
    expect(body).not.toContain("event-secret");
    expect(body).toContain("[REDACTED]");
    expect(() => JSON.parse(body.split("data: ")[1]!.split("\n")[0]!)).not.toThrow();
  });

  it("propagates abort to an active processor", async () => {
    const { agent } = makeAgent();
    const created = await agent.fetch(new Request("https://agent.test/message", { method: "POST", headers: { "x-agent-actor": "user-a" }, body: JSON.stringify({ content: "cancel" }) }));
    const { turnId } = await created.json() as { turnId: string };
    const processing = agent.processTurn(turnId, "user-a", async (_input, signal) => {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
      throw new DOMException("aborted", "AbortError");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const aborted = await agent.fetch(new Request(`https://agent.test/message/${turnId}/abort`, { method: "POST", headers: { "x-agent-actor": "user-a" } }));
    expect((await aborted.json()).status).toBe("aborted");
    expect((await (await processing).json()).status).toBe("aborted");
  });

  it("runs stale-turn recovery with a bounded attempt budget", async () => {
    const recovered = makeAgent({ id: "recover", actor_id: "user-a", status: "running", attempts: 1, input_json: JSON.stringify({ messageId: "recover", content: "retry" }) });
    const processed = await recovered.agent.processTurn("recover", "user-a");
    expect(processed.status).toBe(200);
    expect((await processed.json()).status).toBe("completed");

    const exhausted = makeAgent({ id: "exhausted", actor_id: "user-a", status: "running", attempts: 3, input_json: JSON.stringify({ messageId: "exhausted", content: "stop" }) });
    const rejected = await exhausted.agent.processTurn("exhausted", "user-a");
    expect((await rejected.json()).status).toBe("failed");
    expect(recovered.queries.some((query) => query.includes("attempts < 3"))).toBe(true);
  });

  it("persists one intention ID and reuses it when a turn is regenerated", async () => {
    const { agent, bindings } = makeAgent();
    const created = await agent.fetch(new Request("https://agent.test/message", {
      method: "POST",
      headers: { "x-agent-actor": "user-a" },
      body: JSON.stringify({ content: "register expense" }),
    }));
    const first = await created.json() as { turnId: string; intentionId: string };
    expect(first.intentionId).toMatch(/^[0-9a-f-]{36}$/);

    const firstInput = JSON.parse(String(bindings.find((values) => values.length === 6)?.[3]));
    expect(firstInput.intentionId).toBe(first.intentionId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await agent.processTurn(first.turnId, "user-a", async (input) => {
        expect(input.intentionId).toBe(first.intentionId);
        throw new Error("transient");
      });
    }
    const retried = await agent.fetch(new Request(`https://agent.test/message/${first.turnId}/retry`, {
      method: "POST",
      headers: { "x-agent-actor": "user-a" },
    }));
    expect((await retried.json()).intentionId).toBe(first.intentionId);
  });
});
