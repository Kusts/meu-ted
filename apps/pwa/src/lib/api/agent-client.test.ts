import { afterEach, describe, expect, it, vi } from "vitest";
import { approvePendingOperation, cancelAgentTurn, deleteAgentHistory, exportAgentHistory, fetchPendingOperations, processAgentTurn, reconnectAgentTurn, rejectPendingOperation, retryAgentTurn, sendAgentMessage } from "./agent-client";
import * as agentAuth from "./agent-auth";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("agent client turn lifecycle", () => {
  it("waits through an empty snapshot and follows later terminal events", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(new Response("id: 3\nevent: completed\ndata: {}\n\n", { status: 200 }));
    await expect(reconnectAgentTurn("w1", "t1")).resolves.toEqual([{ id: 3, type: "completed", data: "{}" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a dropped SSE connection and resumes from the cursor", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(new Response("id: 2\nevent: completed\ndata: {}\n\n", { status: 200 }));
    await expect(reconnectAgentTurn("w1", "t1", 1)).resolves.toEqual([{ id: 2, type: "completed", data: "{}" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lists and decides pending operations through the API workspace boundary", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "https://api.example.test");
    const pending = {
      id: "p1", householdId: "w1", requesterId: "u1", operation: "transactions.expense.create", payload: {},
      reason: "high_value", idempotencyKey: "k1", status: "pending", createdAt: "now", expiresAt: "later",
    };
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [pending], total: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...pending, status: "approved" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...pending, status: "rejected" }), { status: 200 }));

    await expect(fetchPendingOperations("w1")).resolves.toHaveLength(1);
    await expect(approvePendingOperation("w1", "p1")).resolves.toMatchObject({ status: "approved" });
    await expect(rejectPendingOperation("w1", "p1")).resolves.toMatchObject({ status: "rejected" });
  });

  it("exports and deletes history through authenticated workspace routes", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1, exportedAt: "now", turns: [], messages: [], actions: [], events: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true, recordCount: 2 }), { status: 200 }));

    await expect(exportAgentHistory("w1")).resolves.toMatchObject({ version: 1 });
    await expect(deleteAgentHistory("w1")).resolves.toEqual({ deleted: true, recordCount: 2 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://agent.example.test/agents/workspace/w1/history/export");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://agent.example.test/agents/workspace/w1/history");
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("DELETE");
  });

  it("sends, reconnects with cursor, cancels and retries through the workspace route", async () => {
    vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_AGENT_BASE_URL", "https://agent.example.test");
    vi.spyOn(agentAuth, "fetchAgentConnectionToken").mockResolvedValue("test-connection-token");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ turnId: "t1", status: "queued" }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ turnId: "t1", status: "completed", output: "done" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("id: 2\nevent: completed\ndata: {}\n\n", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ turnId: "t1", status: "aborted" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ turnId: "t1", status: "queued" }), { status: 200 }));

    await expect(sendAgentMessage("w1", "hello")).resolves.toMatchObject({ turnId: "t1" });
    await expect(processAgentTurn("w1", "t1")).resolves.toMatchObject({ status: "completed" });
    await expect(reconnectAgentTurn("w1", "t1", 1)).resolves.toHaveLength(1);
    await expect(cancelAgentTurn("w1", "t1")).resolves.toMatchObject({ status: "aborted" });
    await expect(retryAgentTurn("w1", "t1")).resolves.toMatchObject({ status: "queued" });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://agent.example.test/agents/workspace/w1/message/stream/t1");
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).headers).toMatchObject({ "Last-Event-ID": "1" });
  });
});
