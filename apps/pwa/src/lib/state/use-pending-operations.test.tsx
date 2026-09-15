/**
 * T5.3 (H-14, SPEC §22) — usePendingOperations hook.
 *
 * The Home indicator is a REFLECTION of the authoritative Agent listing:
 * count comes only from the fetch; the `pi:pending-operations-changed`
 * event invalidates and refetches (dispatched by the TED when an operation
 * is resolved); any failure degrades to `null` (hidden) — never an
 * invented number.
 */
import { act, renderHook, waitFor } from "@/lib/test-utils";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  PENDING_OPERATIONS_CHANGED_EVENT,
  notifyPendingOperationsChanged,
  usePendingOperations,
} from "./use-pending-operations";
import * as agentClient from "@/lib/api/agent-client";

vi.mock("@/lib/api/agent-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/agent-client")>();
  return { ...actual, fetchActivePendingOperations: vi.fn() };
});

const fetchMock = vi.mocked(agentClient.fetchActivePendingOperations);

const leanItem = (id: string) => ({
  id,
  status: "proposed",
  tool: "transactions.expense.create",
  createdAt: "2026-09-15T10:00:00.000Z",
  expiresAt: "2026-09-15T15:00:00.000Z",
  amountCents: 8500,
  description: "Mercado",
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("usePendingOperations", () => {
  it("exposes the count and items from the authoritative listing", async () => {
    fetchMock.mockResolvedValue([leanItem("op-1"), leanItem("op-2")]);

    const { result } = renderHook(() => usePendingOperations("ws-1"));

    await waitFor(() => expect(result.current.pendingCount).toBe(2));
    expect(result.current.items).toHaveLength(2);
    expect(result.current.error).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("ws-1");
  });

  it("refetches when the pending-operations-changed event is dispatched", async () => {
    fetchMock.mockResolvedValue([leanItem("op-1")]);
    const { result } = renderHook(() => usePendingOperations("ws-1"));
    await waitFor(() => expect(result.current.pendingCount).toBe(1));

    fetchMock.mockResolvedValue([]);
    act(() => {
      notifyPendingOperationsChanged();
    });

    await waitFor(() => expect(result.current.pendingCount).toBe(0));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the count unknown (null) on failure — never an invented number", async () => {
    fetchMock.mockRejectedValue(new Error("agent down"));

    const { result } = renderHook(() => usePendingOperations("ws-1"));

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.pendingCount).toBeNull();
    expect(result.current.items).toBeNull();
  });

  it("recovers after a failure when a refresh is requested (retry)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("agent down"));
    const { result } = renderHook(() => usePendingOperations("ws-1"));
    await waitFor(() => expect(result.current.error).toBe(true));

    fetchMock.mockResolvedValue([leanItem("op-1")]);
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBe(false);
    expect(result.current.pendingCount).toBe(1);
  });

  it("does nothing without a workspace (null count, no fetch)", async () => {
    const { result } = renderHook(() => usePendingOperations(null));

    expect(result.current.pendingCount).toBeNull();
    expect(result.current.items).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not restore a previous workspace's items after the workspace becomes unavailable", async () => {
    let resolvePreviousRequest: ((items: ReturnType<typeof leanItem>[]) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreviousRequest = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ workspaceId }: { workspaceId: string | null }) => usePendingOperations(workspaceId),
      { initialProps: { workspaceId: "ws-1" as string | null } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("ws-1"));

    rerender({ workspaceId: null });
    expect(result.current.items).toBeNull();

    await act(async () => {
      resolvePreviousRequest?.([leanItem("op-from-previous-workspace")]);
    });

    expect(result.current.items).toBeNull();
    expect(result.current.pendingCount).toBeNull();
  });

  it("exports the event constant used for invalidation", () => {
    expect(PENDING_OPERATIONS_CHANGED_EVENT).toBe("pi:pending-operations-changed");
  });
});
