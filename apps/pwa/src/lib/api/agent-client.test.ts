import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decidePendingOperation,
  deleteAgentHistory,
  exportAgentHistory,
  fetchAgentHistory,
  sendAgentMessage,
} from "./agent-client";
import * as agentAuth from "./agent-auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("FinanceChatAgent Canonical REST Client & Legacy Adapters", () => {
  it("sends a pending decision only to the authenticated Agent RPC", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ operationId: "op-1", status: "succeeded" }), { status: 200 });
    });

    await expect(decidePendingOperation("workspace-123", "op-1", "confirm")).resolves.toEqual({
      operationId: "op-1",
      status: "succeeded",
    });

    expect(capturedUrl).toBe("https://agent.example.test/agents/finance-chat-agent/workspace-123/rpc/pending-operations/op-1/decision");
    expect(capturedInit?.method).toBe("POST");
    const body = JSON.parse(String(capturedInit?.body));
    expect(body).toMatchObject({ decision: "confirm" });
    expect(body).not.toHaveProperty("attestation");
  });
  it("sendAgentMessage sends POST to /agents/finance-chat-agent/:workspaceId/rpc/chat with x-agent-connection-token and text payload", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");

    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          turnId: "turn-abc",
          status: "completed",
          output: "Seu saldo é R$ 1.000,00.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const result = await sendAgentMessage("workspace-123", "Quanto gastei?");

    expect(capturedUrl).toBe("https://agent.example.test/agents/finance-chat-agent/workspace-123/rpc/chat");
    expect(capturedInit?.method).toBe("POST");
    expect((capturedInit?.headers as Record<string, string>)["x-agent-connection-token"]).toBe("signed-token-123");
    expect(capturedInit?.body).toBe(JSON.stringify({ text: "Quanto gastei?" }));
    expect(result.output).toBe("Seu saldo é R$ 1.000,00.");
  });

  it("fetchAgentHistory sends GET to /agents/finance-chat-agent/:workspaceId/rpc/history and parses isOwn correctly", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");

    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "msg-1",
              actorId: "user-1",
              role: "user",
              content: "Mensagem 1",
              createdAt: "2026-08-30T10:00:00Z",
              isOwn: true,
            },
            {
              id: "msg-2",
              actorId: "ted",
              role: "assistant",
              content: "Resposta do assistente",
              createdAt: "2026-08-30T10:00:05Z",
              isOwn: false,
            },
            {
              id: "msg-3",
              actorId: "user-2",
              role: "user",
              content: "Mensagem do outro membro",
              createdAt: "2026-08-30T10:01:00Z",
              isOwn: false,
            },
          ],
          total: 3,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const items = await fetchAgentHistory("workspace-123");

    expect(capturedUrl).toBe("https://agent.example.test/agents/finance-chat-agent/workspace-123/rpc/history");
    expect((capturedInit?.headers as Record<string, string>)["x-agent-connection-token"]).toBe("signed-token-123");
    expect(items).toHaveLength(3);
    expect(items[0]!.isOwn).toBe(true);
    expect(items[1]!.isOwn).toBe(false);
    expect(items[2]!.isOwn).toBe(false);
  });

  it("RED (1): fetchAgentHistory fails closed and throws when isOwn is missing in /rpc/history response", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              id: "msg-1",
              actorId: "other-user",
              role: "user",
              content: "Mensagem de outro membro sem isOwn",
              // isOwn is absent
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    // Must reject because isOwn is strictly required by the Finance contract
    await expect(fetchAgentHistory("workspace-123")).rejects.toThrow();
  });

  it("RED (2): sendAgentMessage and fetchAgentHistory propagate token error and do not call fetch against the agent", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockRejectedValue(new Error("Token generation failed: Unauthorized"));

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(sendAgentMessage("workspace-123", "Olá")).rejects.toThrow("Token generation failed: Unauthorized");
    expect(fetchSpy).not.toHaveBeenCalled();

    await expect(fetchAgentHistory("workspace-123")).rejects.toThrow("Token generation failed: Unauthorized");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sendAgentMessage propagates safe error message when agent returns failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "agent.usage_limit",
          message: "Limite de tokens diário atingido.",
        }),
        { status: 429, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(sendAgentMessage("workspace-123", "Olá")).rejects.toThrow(
      "Limite de tokens diário atingido.",
    );
  });

  it("legacy helpers remain available for backwards compatibility", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, exportedAt: "now", turns: [], messages: [], actions: [], events: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true, recordCount: 2 }), { status: 200 }));

    await expect(exportAgentHistory("w1")).resolves.toMatchObject({ version: 1 });
    await expect(deleteAgentHistory("w1")).resolves.toEqual({ deleted: true, recordCount: 2 });
  });

});
