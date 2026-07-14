// Subscriptions adapter tests — characterizes lazy-load refresh semantics.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSubscriptionsAdapter } from "./subscriptions-adapter";
import * as endpoints from "@/lib/api/endpoints";
import type { Subscription } from "./types";
import * as snapshotStore from "./snapshot-store";

const TOKEN = "test-token";
const SUBS: Subscription[] = [
  { id: "s1", name: "Netflix", amountCents: 5590, cycle: "monthly", day: 15, paymentMethod: "credit_card", status: "active" },
];

describe("subscriptions adapter — refresh", () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it("fetch success: returns data with source 'live'", async () => {
    vi.spyOn(endpoints, "fetchSubscriptions").mockResolvedValue(SUBS as never);
    vi.spyOn(snapshotStore, "saveSnapshotDomain").mockResolvedValue(undefined);
    const adapter = createSubscriptionsAdapter({ token: TOKEN, online: true });
    const result = await adapter.refresh();
    expect(result).not.toBeNull();
    expect(result!.data).toEqual(SUBS);
    expect(result!.source).toBe("live");
    expect(result!.syncedAt).toBeTruthy();
  });

  it("persists to snapshot on fetch success", async () => {
    const spy = vi.spyOn(snapshotStore, "saveSnapshotDomain").mockResolvedValue(undefined);
    vi.spyOn(endpoints, "fetchSubscriptions").mockResolvedValue(SUBS as never);
    const adapter = createSubscriptionsAdapter({ token: TOKEN, online: true });
    await adapter.refresh();
    expect(spy).toHaveBeenCalledWith(TOKEN, "subscriptions", SUBS);
  });

  it("returns null when offline", async () => {
    const spy = vi.spyOn(endpoints, "fetchSubscriptions");
    const adapter = createSubscriptionsAdapter({ token: TOKEN, online: false });
    expect(await adapter.refresh()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetch failure + snapshot: returns snapshot with source 'snapshot'", async () => {
    vi.spyOn(endpoints, "fetchSubscriptions").mockRejectedValue(new Error("down"));
    vi.spyOn(snapshotStore, "loadSnapshotDomain").mockResolvedValue({
      data: SUBS as never, syncedAt: "2026-07-13T00:00:00.000Z",
    });
    const adapter = createSubscriptionsAdapter({ token: TOKEN, online: true });
    const result = await adapter.refresh();
    expect(result!.data).toEqual(SUBS);
    expect(result!.source).toBe("snapshot");
  });

  it("fetch failure + no snapshot: returns empty with source 'unavailable'", async () => {
    vi.spyOn(endpoints, "fetchSubscriptions").mockRejectedValue(new Error("down"));
    vi.spyOn(snapshotStore, "loadSnapshotDomain").mockResolvedValue(null);
    const adapter = createSubscriptionsAdapter({ token: TOKEN, online: true });
    const result = await adapter.refresh();
    expect(result!.data).toEqual([]);
    expect(result!.source).toBe("unavailable");
  });
});
