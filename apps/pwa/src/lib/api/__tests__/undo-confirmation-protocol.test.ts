import { afterEach, describe, expect, it, vi } from "vitest";
import { decideUndoProposal, sendAgentMessage } from "../agent-client";
import * as agentAuth from "../agent-auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("debt-undo-confirmation-protocol: PWA undo RPC", () => {
  it("decideUndoProposal posts strict {decision,requestId} to the undo decision RPC", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify({ requestId: "proposal-1", status: "confirmed" }), { status: 200 });
    });

    await expect(decideUndoProposal("workspace-123", "proposal-1", "confirm")).resolves.toEqual({
      requestId: "proposal-1",
      status: "confirmed",
    });

    expect(capturedUrl).toBe("https://agent.example.test/agents/finance-chat-agent/workspace-123/rpc/undo/decision");
    expect(capturedInit?.method).toBe("POST");
    expect(JSON.parse(String(capturedInit?.body))).toEqual({ decision: "confirm", requestId: "proposal-1" });
  });

  it("sendAgentMessage surfaces a strict undoProposal and drops unknown keys", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          turnId: "turn-1",
          status: "completed",
          output: "Encontrei a última ação para desfazer.",
          undoProposal: { requestId: "proposal-1", status: "proposed", expiresAt: "2026-09-19T12:00:00Z", injected: "drop" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const turn = await sendAgentMessage("workspace-123", "desfaz o último");
    expect(turn.undoProposal).toEqual({ requestId: "proposal-1", status: "proposed", expiresAt: "2026-09-19T12:00:00Z" });
  });

  it("surfaces the executing code when cancel races an in-flight confirm", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ code: "undo.executing", message: "Undo already in progress." }), { status: 409 }),
    );

    await expect(decideUndoProposal("workspace-123", "proposal-1", "cancel")).rejects.toMatchObject({
      code: "undo.executing",
    });
  });
});
