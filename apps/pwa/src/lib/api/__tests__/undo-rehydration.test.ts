import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchActiveUndoProposals } from "../agent-client";
import * as agentAuth from "../agent-auth";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("debt-undo-proposal-rehydration: PWA active undo fetch", () => {
  it("fetches bound active summaries from the Agent RPC", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");
    let capturedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          items: [
            { requestId: "proposal-1", status: "proposed", expiresAt: "2099-01-01T12:00:00Z" },
            { requestId: "proposal-2", status: "executing", expiresAt: "2099-01-01T12:00:00Z" },
          ],
          total: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await expect(fetchActiveUndoProposals("workspace-123")).resolves.toEqual([
      { requestId: "proposal-1", status: "proposed", expiresAt: "2099-01-01T12:00:00Z" },
      { requestId: "proposal-2", status: "executing", expiresAt: "2099-01-01T12:00:00Z" },
    ]);
    expect(capturedUrl).toBe(
      "https://agent.example.test/agents/finance-chat-agent/workspace-123/rpc/undo/active",
    );
  });

  it("drops payloads carrying target/key material wholesale", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          items: [
            {
              requestId: "proposal-1",
              status: "proposed",
              expiresAt: "2026-09-19T12:00:00Z",
              targetLastOperationId: "audit-op-1",
              idempotencyKey: "undo:ws-1:proposal-1",
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(fetchActiveUndoProposals("workspace-123")).rejects.toThrow();
  });

  it("omits client-side expired summaries without deciding anything", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("signed-token-123");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(
        JSON.stringify({
          items: [
            { requestId: "proposal-old", status: "proposed", expiresAt: "2020-01-01T00:00:00Z" },
            { requestId: "proposal-live", status: "proposed", expiresAt: "2099-01-01T00:00:00Z" },
          ],
          total: 2,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(fetchActiveUndoProposals("workspace-123")).resolves.toEqual([
      { requestId: "proposal-live", status: "proposed", expiresAt: "2099-01-01T00:00:00Z" },
    ]);
    // Read-only GET: exactly one call, never a decision POST.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/rpc/undo/active");
  });
});
