// Subscriptions adapter — extracted lazy-load refresh logic.
// Subscription failure is nonessential: falls back to v2 snapshot or empty
// array, never crashes the app.

import type { Subscription } from "./types";
import * as endpoints from "@/lib/api/endpoints";
import { saveSnapshotDomain, loadSnapshotDomain } from "./snapshot-store";

export interface SubscriptionsAdapterOptions {
  token: string;
  online: boolean;
}

export interface RefreshResult {
  data: Subscription[];
  source: "live" | "snapshot" | "unavailable";
  syncedAt: string | null;
}

export interface SubscriptionsAdapter {
  /** Lazy-load subscriptions.
   * Returns null when offline (no fetch attempted).
   * On success: data from API, source "live".
   * On failure: fallback to snapshot (if available, source "snapshot") or
   * empty array (source "unavailable"). Never throws. */
  refresh(): Promise<RefreshResult | null>;
}

export function createSubscriptionsAdapter(options: SubscriptionsAdapterOptions): SubscriptionsAdapter {
  const { token, online } = options;

  async function refresh(): Promise<RefreshResult | null> {
    if (!online) return null;

    try {
      const data = await endpoints.fetchSubscriptions();
      // Best-effort: persist to v2 snapshot (failure must not break UI)
      await saveSnapshotDomain(token, "subscriptions", data).catch(() => {});
      return {
        data,
        source: "live",
        syncedAt: new Date().toISOString(),
      };
    } catch {
      // Nonessential failure: fallback to snapshot
      const snap = await loadSnapshotDomain(token, "subscriptions");
      if (snap) {
        return {
          data: snap.data as Subscription[],
          source: "snapshot",
          syncedAt: snap.syncedAt,
        };
      }
      return {
        data: [],
        source: "unavailable",
        syncedAt: null,
      };
    }
  }

  return { refresh };
}
