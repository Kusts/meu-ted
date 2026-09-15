import { describe, expect, it, vi } from "vitest";
import worker, { FinanceChatAgent } from "../src/worker.js";

type WorkerEnv = Parameters<typeof worker.fetch>[1];

describe("FinanceChatAgent & Worker Integration (Task 4)", () => {
  const API_ORIGIN = "https://api.example.test";
  const WORKSPACE_ID = "workspace-integration-test-1";

  const mockEnv: WorkerEnv = {
    API_ORIGIN,
    AGENT_AUTH_SERVICE_TOKEN: "test-auth-service-token",
    AGENT: {
      idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
      get: vi.fn(() => ({
        exportFullWorkspaceHistory: vi.fn(async () => ({
          version: 1,
          workspaceId: WORKSPACE_ID,
          turns: [],
          messages: [],
          hasInFlightTurns: false,
        })),
        fetch: vi.fn(async () => new Response("legacy agent")),
      })),
    },
    FINANCE_CHAT_AGENT: {
      idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
      get: vi.fn(() => ({
        importLegacyHistory: vi.fn(async () => ({ success: true, importedCount: 0, skipped: true })),
        fetch: vi.fn(async (req: Request) => {
          const url = new URL(req.url);
          if (url.pathname.includes("/message")) {
            return new Response(JSON.stringify({ text: "TED response" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response("finance-chat-agent ok", { status: 200 });
        }),
      })),
    },
  };

  it("exposes /health/agent and returns binding FINANCE_CHAT_AGENT", async () => {
    const res = await worker.fetch(new Request("https://agent.example.test/health/agent"), mockEnv);
    expect(res.status).toBe(200);
    const body = await res.json() as { status?: string; binding?: string };
    expect(body).toEqual({ status: "ready", binding: "FINANCE_CHAT_AGENT" });
  });

  it("routes /agents/finance-chat-agent/:workspaceId/rpc/history after validating workspace membership", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ userId: "user-1", role: "member" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: "user-1" } }), { status: 200 }))
      // C-05: the cookie fallback resolves the canonical id before naming
      // the DO (fail-closed when the authority is reachable).
      .mockResolvedValueOnce(new Response(JSON.stringify({ canonicalHouseholdId: WORKSPACE_ID }), { status: 200 }));

    const res = await worker.fetch(
      new Request(`https://agent.example.test/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`, {
        headers: {
          cookie: "better-auth.session_token=test-session",
          origin: "https://pwa.example.test",
        },
      }),
      mockEnv,
    );

    expect(res.status).toBe(200);
    expect(mockEnv.FINANCE_CHAT_AGENT.get).toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("rejects unauthorized access to /agents/finance-chat-agent/:workspaceId with 401/403", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

    const res = await worker.fetch(
      new Request(`https://agent.example.test/agents/finance-chat-agent/${WORKSPACE_ID}`, {
        headers: {
          cookie: "better-auth.session_token=invalid-session",
        },
      }),
      mockEnv,
    );

    expect([401, 403, 503]).toContain(res.status);
    fetchMock.mockRestore();
  });

  it("enforces messageConcurrency='queue' on FinanceChatAgent", () => {
    expect(FinanceChatAgent.messageConcurrency).toBe("queue");
  });

  it("fails closed when provider is not configured rather than echoing raw input or silently falling back", async () => {
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
    // Non-finance utterance on purpose: finance-seeking reads fail closed on
    // missing evidence (SPEC §14) before ever consulting the provider, so the
    // provider-gate premise is exercised with a general question.
    const result = await agent.onChatMessage({ text: "Olá, como você pode me ajudar?", intentionId: "intent-provider-gate-1" }) as { text?: string };
    expect(result).toBeDefined();
    expect(result.text).not.toBe("Olá, como você pode me ajudar?");
    expect(result.text).toContain("provider not configured");
  });

  it("intercepts and rejects clearHistory frames for chat members", async () => {
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
    const sent: string[] = [];
    const connection = {
      send: (msg: string) => { sent.push(msg); },
    };

    await agent.onMessage(connection, JSON.stringify({ type: "clearHistory" }));
    expect(sent.some((s) => s.includes("agent.clear_forbidden"))).toBe(true);
  });
});
