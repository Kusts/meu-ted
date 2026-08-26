import { describe, expect, it } from "vitest";
import { WorkspaceAgent } from "../src/index";

type SafetyEnv = {
  AGENT_DELEGATION_SECRET: string;
  AGENT_DAILY_TOKEN_BUDGET?: string;
  AGENT_RATE_LIMIT_MAX_REQUESTS?: string;
};

function makeAgent(env: SafetyEnv = { AGENT_DELEGATION_SECRET: "test-secret" }): { agent: WorkspaceAgent; stored: string[] } {
  const stored: string[] = [];
  const turns = new Map<string, { id: string; actor_id: string; status: string; attempts: number; input_json: string }>();
  let dailyTokens = 0;
  const rateWindows = new Map<string, number>();
  const sql = {
    exec<T = unknown>(query: string, ...bindings: unknown[]): Iterable<T> {
      if (query.startsWith("SELECT version")) return [] as T[];
      if (query.includes("FROM daily_token_usage")) return [{ total_tokens: dailyTokens }] as T[];
      if (query.startsWith("INSERT INTO daily_token_usage")) {
        dailyTokens += Number(bindings.at(-1) ?? 0);
        return [] as T[];
      }
      if (query.includes("FROM agent_rate_limits")) return [{ window_started_at: Math.floor(Date.now() / 60_000) * 60_000, request_count: rateWindows.get(String(bindings[0])) ?? 0 }] as T[];
      if (query.startsWith("INSERT INTO agent_rate_limits")) {
        const actor = String(bindings[0]);
        rateWindows.set(actor, (rateWindows.get(actor) ?? 0) + 1);
        return [] as T[];
      }
      if (query.startsWith("INSERT INTO turn_queue")) {
        turns.set(String(bindings[0]), { id: String(bindings[0]), actor_id: String(bindings[2]), status: "queued", attempts: 0, input_json: String(bindings[3]) });
      }
      if (query.includes("FROM turn_queue WHERE id = ?")) {
        const turn = turns.get(String(bindings[0]));
        return (turn ? [turn] : []) as T[];
      }
      if (query.startsWith("UPDATE turn_queue SET status = 'running'")) {
        const turn = turns.get(String(bindings[0]));
        if (turn) { turn.status = "running"; turn.attempts += 1; }
      }
      if (query.startsWith("UPDATE turn_queue SET status = 'completed'")) {
        const turn = turns.get(String(bindings[2]));
        if (turn) turn.status = "completed";
      }
      if (query.startsWith("INSERT INTO messages") || query.startsWith("INSERT INTO agent_actions")) {
        stored.push(JSON.stringify(bindings));
      }
      return [] as T[];
    },
  };
  return { agent: new WorkspaceAgent({ storage: { sql } }, env), stored };
}

const post = (agent: WorkspaceAgent, content: string, actor = "user-a") => agent.fetch(new Request("https://agent.test/message", {
  method: "POST", headers: { "x-agent-actor": actor }, body: JSON.stringify({ content }),
}));

describe("Agent safety budgets and transcript", () => {
  it("redacts credentials before durable transcript and action persistence", async () => {
    const { agent, stored } = makeAgent();
    const escapedPassword = String.raw`password="sec\"ret\\path"`;
    const response = await post(agent, `Minha ${escapedPassword} e password=super-secret e password: \"frase muito secreta\" e Authorization: Basic abc123 e private_key=-----BEGIN PRIVATE KEY-----\\nSECRET\\n-----END PRIVATE KEY----- credentials=LIVE-CREDENTIAL passphrase=phrase accessKeyId=camel-access secret_key=under-secret token_value=token-secret não devem persistir`);

    expect(response.status).toBe(202);
    const durable = stored.join("\n");
    expect(durable).toContain("[REDACTED]");
    expect(durable).not.toContain("super-secret");
    expect(durable).not.toContain("sec\\\"ret");
    expect(durable).not.toContain("\\\\path");
    expect(durable).not.toContain("frase muito secreta");
    expect(durable).not.toContain("abc123");
    expect(durable).not.toContain("BEGIN PRIVATE KEY");
    expect(durable).not.toContain("SECRET");
    expect(durable).not.toContain("LIVE-CREDENTIAL");
    expect(durable).not.toContain("passphrase=phrase");
    expect(durable).not.toContain("camel-access");
    expect(durable).not.toContain("under-secret");
    expect(durable).not.toContain("token-secret");
  });

  it("redacts processor output before returning and persisting the assistant transcript", async () => {
    const { agent, stored } = makeAgent();
    const created = await post(agent, "summarize");
    const { turnId } = await created.json() as { turnId: string };

    const response = await agent.processTurn(turnId, "user-a", async () => "api_key=top-secret Bearer output-token");
    expect((await response.json()).output).toContain("[REDACTED]");
    expect(stored.join("\\n")).not.toContain("top-secret");
    expect(stored.join("\\n")).not.toContain("output-token");
  });

  it("enforces a durable daily token budget per actor", async () => {
    const { agent } = makeAgent({ AGENT_DELEGATION_SECRET: "test-secret", AGENT_DAILY_TOKEN_BUDGET: "5" });

    expect((await post(agent, "12345678901234567890")).status).toBe(202);
    expect((await post(agent, "12345678901234567890")).status).toBe(429);
  });

  it("enforces a per-actor request rate limit", async () => {
    const { agent } = makeAgent({ AGENT_DELEGATION_SECRET: "test-secret", AGENT_RATE_LIMIT_MAX_REQUESTS: "2" });

    expect((await post(agent, "one")).status).toBe(202);
    expect((await post(agent, "two")).status).toBe(202);
    expect((await post(agent, "three")).status).toBe(429);
  });
});
