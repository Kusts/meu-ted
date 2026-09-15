import { afterEach, describe, expect, it, vi } from "vitest";
import {
  sendAgentMessage,
  composeChatSend,
  createChatMessageId,
  savePendingChatSend,
  loadPendingChatSend,
  clearPendingChatSend,
} from "../agent-client";
import * as agentAuth from "../agent-auth";

vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
  sessionStorage.clear();
});

const okTurn = (output = "ok") =>
  new Response(JSON.stringify({ turnId: "t1", status: "completed", output }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

describe("SPEC §7.7: stable per-turn idempotency (PWA messageId)", () => {
  it("RED: every send carries a stable intentionId; retry of the same send reuses it", async () => {
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("tok");
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      // First attempt: lost response (500). Retry: success.
      return bodies.length === 1
        ? new Response(JSON.stringify({ message: "falha transitória" }), { status: 500 })
        : okTurn();
    });

    const send = composeChatSend("Gastei R$ 50 no mercado");
    await expect(sendAgentMessage("ws-1", send.content, { messageId: send.messageId })).rejects.toThrow();
    const result = await sendAgentMessage("ws-1", send.content, { messageId: send.messageId });

    expect(result.output).toBe("ok");
    expect(bodies).toHaveLength(2);
    const first = bodies[0] as { intentionId?: string };
    const second = bodies[1] as { intentionId?: string };
    expect(first.intentionId).toBe(send.messageId);
    expect(second.intentionId).toBe(send.messageId);
  });

  it("RED: retry without an explicit id generates distinct ids (caller must reuse)", async () => {
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("tok");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => okTurn());
    const first = createChatMessageId();
    const second = createChatMessageId();
    expect(first).not.toBe(second);
  });

  it("RED: pending send survives reload (sessionStorage) with the same messageId", () => {
    const send = composeChatSend("Gastei R$ 50 no mercado");
    savePendingChatSend("ws-1", send);
    // Simulate page reload: module state is fresh, storage persists.
    const restored = loadPendingChatSend("ws-1");
    expect(restored?.messageId).toBe(send.messageId);
    expect(restored?.content).toBe(send.content);
    clearPendingChatSend("ws-1");
    expect(loadPendingChatSend("ws-1")).toBeNull();
  });

  it("RED: sendAgentMessage persists the pending send and clears it on success", async () => {
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("tok");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => okTurn());

    const send = composeChatSend("Quanto gastei?");
    await sendAgentMessage("ws-1", send.content, { messageId: send.messageId });
    expect(loadPendingChatSend("ws-1")).toBeNull();
  });
});
