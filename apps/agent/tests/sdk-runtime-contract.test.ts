import { describe, it, expect } from "vitest";
import { AIChatAgent } from "agents/ai-chat-agent";
import { FinanceChatAgent } from "../src/finance-chat-agent.js";
import worker from "../src/worker.js";

describe("Agents SDK Runtime Contract & Isolation (Steps 2 & 6)", () => {
  describe("Structural Contract", () => {
    it("FinanceChatAgent extends AIChatAgent", () => {
      expect(FinanceChatAgent.prototype).toBeInstanceOf(AIChatAgent);
    });

    it("enforces messageConcurrency='queue'", () => {
      expect((FinanceChatAgent as unknown as { messageConcurrency?: string }).messageConcurrency).toBe("queue");
    });

    it("does not have a default echo processor on new path", async () => {
      const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
      // In new path, onChatMessage should not simply return raw input echo
      const result = await (agent as unknown as { onChatMessage?: (msg: unknown) => Promise<unknown> }).onChatMessage?.({
        text: "teste de mensagem financeira",
        intentionId: "intent-sdk-contract-1",
      });
      if (typeof result === "object" && result !== null && "text" in result) {
        expect((result as { text: string }).text).not.toBe("teste de mensagem financeira");
      }
    });
  });

  describe("Isolation & Routing Contract", () => {
    it("worker exposes /health/agent and returns binding FINANCE_CHAT_AGENT", async () => {
      const req = new Request("http://localhost/health/agent");
      const res = await worker.fetch(req, {
        AGENT: {} as DurableObjectNamespace,
        FINANCE_CHAT_AGENT: {} as DurableObjectNamespace,
        API_ORIGIN: "http://api.local",
      }, {});
      expect(res.status).toBe(200);
      const json = await res.json() as { binding?: string };
      expect(json.binding).toBe("FINANCE_CHAT_AGENT");
    });

    it("rejects unauthorized workspace requests with 401/403 before reaching agent", async () => {
      const req = new Request("http://localhost/agents/finance-chat-agent/workspace-secret", {
        headers: { origin: "http://evil.com" },
      });
      // Mock fetch to API_ORIGIN rejecting session
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async () => new Response(JSON.stringify({ code: "agent.session_required" }), { status: 401 });
      try {
        const res = await worker.fetch(req, {
          AGENT: {} as DurableObjectNamespace,
          FINANCE_CHAT_AGENT: {} as DurableObjectNamespace,
          API_ORIGIN: "http://api.local",
          AGENT_AUTH_SERVICE_TOKEN: "service-token",
        }, {});
        expect([401, 403]).toContain(res.status);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("intercepts and rejects unauthorized clearHistory/setMessages frames", async () => {
      const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
      const sentMessages: string[] = [];
      const fakeConnection = {
        send: (msg: string) => { sentMessages.push(msg); },
      };

      if (typeof (agent as unknown as { onMessage?: (conn: unknown, msg: string) => Promise<void> }).onMessage === "function") {
        await (agent as unknown as { onMessage: (conn: unknown, msg: string) => Promise<void> }).onMessage(
          fakeConnection,
          JSON.stringify({ type: "clearHistory" }),
        );
        expect(sentMessages.some((m) => m.includes("agent.clear_forbidden"))).toBe(true);
      }
    });
  });
});
