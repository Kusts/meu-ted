import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../src/worker.js";
import { createAgentConnectionToken } from "../../api/src/auth/agent-connection-token.js";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

describe("Gateway post-removal passthrough (T4.3 single runtime, INV-07)", () => {
  afterEach(() => vi.restoreAllMocks());

  const SECRET = "secret-for-testing-purposes-at-least-32-chars!";
  const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
  const GENUINE_USER = "user-authenticated-uuid";

  // C-01/C-02: Worker auth resolves the canonical workspace and consumes
  // the single-use token before routing — mock both internal endpoints.
  const mockAuthEndpoints = () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (info) => {
      const url = String(info);
      if (url.includes("/internal/workspace-alias/")) {
        return new Response(JSON.stringify({ canonicalHouseholdId: WORKSPACE_ID }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/internal/agent/consume-token")) {
        return new Response(JSON.stringify({ ok: true, consumed: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("unexpected upstream", { status: 500 });
    });
  };

  const mockEnv = (financeFetchSpy: ReturnType<typeof vi.fn>) =>
    ({
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((n: string) => ({ name: n }) as unknown as DurableObjectId),
        get: vi.fn(() => ({ fetch: financeFetchSpy }) as unknown as never),
      },
      API_ORIGIN: "https://api.test.local",
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
      AGENT_AUTH_SERVICE_TOKEN: "service-token",
    }) as unknown as WorkerEnv;

  it("GET /rpc/history reaches FinanceChatAgent directly — no retired migration gate", async () => {
    const token = await createAgentConnectionToken({ sub: GENUINE_USER, workspace: WORKSPACE_ID, role: "owner" }, SECRET);
    const financeFetchSpy = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 }));

    const req = new Request(`https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`, {
      method: "GET",
      headers: { "x-agent-connection-token": token, origin: "https://pwa.example" },
    });

    mockAuthEndpoints();
    const res = await worker.fetch(req, mockEnv(financeFetchSpy));
    expect(res.status).toBe(200);
    expect(financeFetchSpy).toHaveBeenCalledOnce();
  });

  it("POST /rpc/chat reaches FinanceChatAgent directly — never 409 from a retired migration", async () => {
    const token = await createAgentConnectionToken({ sub: GENUINE_USER, workspace: WORKSPACE_ID, role: "owner" }, SECRET);
    const financeFetchSpy = vi.fn(async () => new Response(JSON.stringify({ status: "completed" }), { status: 200 }));

    const req = new Request(`https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-connection-token": token, origin: "https://pwa.example" },
      body: JSON.stringify({ text: "hello" }),
    });

    mockAuthEndpoints();
    const res = await worker.fetch(req, mockEnv(financeFetchSpy));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code?: string; status?: string };
    expect(body.code).toBeUndefined();
    expect(financeFetchSpy).toHaveBeenCalledOnce();
  });
});
