import { describe, it, expect, vi } from "vitest";
import { AgentClient } from "./agent-client.js";

describe("AgentClient", () => {
  it("resolves bridge context from API and executes Agent Worker turn with delegated token", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/auth/bridge-context")) {
        return new Response(JSON.stringify({
          success: true,
          delegatedToken: "valid-delegated-jwt",
          user: { id: "user-1", name: "Alice", email: "alice@test.com" },
          workspace: { id: "workspace-1", role: "owner" },
        }), { status: 200 });
      }
      if (url.includes("/turn")) {
        const body = JSON.parse(init?.body as string);
        expect(body.delegatedToken).toBe("valid-delegated-jwt");
        expect(body.content).toBe("gastei 50 no mercado");
        expect(body.requestId).toBe("whatsapp:msg-100");
        // Verify no raw userId or workspaceId was sent in the body payload
        expect(body.userId).toBeUndefined();
        expect(body.workspaceId).toBeUndefined();

        return new Response(JSON.stringify({
          success: true,
          text: "💸 Anotado: R$ 50 em Alimentação > Mercado.",
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const client = new AgentClient({
      apiBaseUrl: "http://api.test",
      agentBaseUrl: "http://agent.test",
      fetchFn: mockFetch,
    });

    const res = await client.send("gastei 50 no mercado", "+55 (11) 99999-1111", {
      source: "whatsapp",
      chatId: "5511999991111@s.whatsapp.net",
      providerMessageId: "msg-100",
    });

    expect(res.success).toBe(true);
    expect(res.data?.message).toBe("💸 Anotado: R$ 50 em Alimentação > Mercado.");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles failure when bridge identity resolution fails", async () => {
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/bridge-context")) {
        return new Response(JSON.stringify({
          code: "auth.user_not_found",
          message: "Telefone não cadastrado",
        }), { status: 404 });
      }
      return new Response("Not found", { status: 404 });
    });

    const client = new AgentClient({
      apiBaseUrl: "http://api.test",
      agentBaseUrl: "http://agent.test",
      fetchFn: mockFetch,
    });

    const res = await client.send("oi", "5511000000000", {
      source: "whatsapp",
      chatId: "5511000000000@s.whatsapp.net",
      providerMessageId: "msg-404",
    });

    expect(res.success).toBe(false);
    expect(res.reason).toContain("Telefone não cadastrado");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 from Agent Worker with exponential backoff and succeeds", async () => {
    let turnCalls = 0;
    const mockFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/bridge-context")) {
        return new Response(JSON.stringify({
          success: true,
          delegatedToken: "valid-delegated-jwt",
          user: { id: "user-1", name: "Alice", email: "alice@test.com" },
          workspace: { id: "workspace-1", role: "owner" },
        }), { status: 200 });
      }
      if (url.includes("/turn")) {
        turnCalls++;
        if (turnCalls === 1) {
          return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 503 });
        }
        return new Response(JSON.stringify({
          success: true,
          text: "Resposta após retry!",
        }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const client = new AgentClient({
      apiBaseUrl: "http://api.test",
      agentBaseUrl: "http://agent.test",
      maxRetries: 2,
      fetchFn: mockFetch,
    });

    const res = await client.send("oi", "+5511999991111", {
      source: "whatsapp",
      chatId: "5511999991111@s.whatsapp.net",
      providerMessageId: "msg-retry",
    });

    expect(res.success).toBe(true);
    expect(res.data?.message).toBe("Resposta após retry!");
    expect(turnCalls).toBe(2);
  });
});
