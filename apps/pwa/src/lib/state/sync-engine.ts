/**
 * Sync engine — orchestrates the bootstrap data fetch, dispatches
 * reducer actions, and persists to v2 (IndexedDB) snapshot.
 *
 * v2 is canonical: all snapshot reads/writes use IndexedDB, not localStorage.
 * Preloaded snapshot data is optionally passed in for offline bootstrap.
 */

import * as endpoints from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { type DomainKey, type AppStateAction, ESSENTIAL_DOMAIN_KEYS } from "./state-reducer";
import { saveSnapshotDomain } from "./snapshot-store";
import type { Account, Profile, QuickInsight, Transaction } from "./types";

type Dispatch = (action: AppStateAction) => void;

export interface PaginationOptions {
  page?: number;
  limit?: number;
}

/** Preloaded snapshot data, keyed by domain. Passed when booting from offline cache. */
export type SnapshotPreload = Partial<Record<DomainKey, { data: unknown; syncedAt: string }>>;

/**
 * Values already fetched by the bootstrap that the provider needs outside the
 * reducer. Returning them lets callers hydrate profile/insights without a
 * second network fetch.
 */
export interface BootstrapExtras {
  profile: Profile | null;
  quickInsights: QuickInsight[];
}

/**
 * Run the full bootstrap: fetch all domains, classify results, dispatch,
 * and persist live data to v2 snapshot.
 *
 * @param token — auth token
 * @param dispatch — dispatches reducer actions
 * @param expireSession — called on 401
 * @param snapshotPreload — optional preloaded v2 snapshot data for offline boot
 * @returns the profile and quick insights fetched during the bootstrap
 */
export async function runBootstrap(
  token: string,
  dispatch: Dispatch,
  expireSession: () => void,
  snapshotPreload?: SnapshotPreload,
): Promise<BootstrapExtras> {
  dispatch({ type: "BOOTSTRAP_START" });

  const results = await Promise.allSettled([
    endpoints.fetchAccounts(),
    endpoints.fetchCategories(),
    endpoints.fetchTransactions({ limit: 200 }),
    endpoints.fetchPayables(),
    endpoints.fetchBudgets(),
    endpoints.fetchGoals(),
    endpoints.fetchStatements(),
    endpoints.fetchCards(),
    endpoints.fetchProfile(),
    endpoints.fetchQuickInsights(),
  ]);

  // Runtime 401 short-circuit
  const unauthorized = results.some(
    (r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 401,
  );
  if (unauthorized) {
    expireSession();
    dispatch({ type: "BOOTSTRAP_401" });
    return { profile: null, quickInsights: [] };
  }

  // Profile/insights are fetched here and returned to the caller — never
  // re-fetched by the provider (boot dedupe).
  const profileResult = results[8];
  const insightsResult = results[9];
  const extras: BootstrapExtras = {
    profile: profileResult.status === "fulfilled" ? (profileResult.value as Profile | null) : null,
    quickInsights: insightsResult.status === "fulfilled" ? (insightsResult.value as QuickInsight[]) : [],
  };

  // Collect v2 save promises so we await them before BOOTSTRAP_COMPLETE
  const savePromises: Promise<void>[] = [];

  // ── Accounts + credit cards merge ────────────────────────
  {
    const accountsResult = results[0];
    const cardsResult = results[7];
    const accountsOk = accountsResult.status === "fulfilled";
    const cardsOk = cardsResult.status === "fulfilled";
    const cardsData = cardsOk ? (cardsResult.value as Account[]) : [];

    let merged: Account[] | null = null;

    if (accountsOk) {
      merged = [...(accountsResult.value as Account[])];
      for (const c of cardsData) {
        const idx = merged.findIndex((m) => m.id === c.id);
        if (idx >= 0) merged[idx] = c;
        else merged.push(c);
      }
      dispatch({ type: "DOMAIN_LIVE", domain: "accounts", data: merged, syncedAt: new Date().toISOString() });
      savePromises.push(saveSnapshotDomain(token, "accounts", merged));
    } else if (cardsData.length > 0) {
      merged = cardsData;
      dispatch({ type: "DOMAIN_LIVE", domain: "accounts", data: cardsData, syncedAt: new Date().toISOString() });
      savePromises.push(saveSnapshotDomain(token, "accounts", cardsData));
    } else {
      // Snapshot fallback from preload or unavailable
      const preloaded = snapshotPreload?.accounts;
      if (preloaded) {
        dispatch({ type: "DOMAIN_SNAPSHOT", domain: "accounts", data: preloaded.data, syncedAt: preloaded.syncedAt });
      } else {
        dispatch({ type: "DOMAIN_UNAVAILABLE", domain: "accounts" });
      }
    }
  }

  // ── Helper for standard list domains ─────────────────────
  function applyListDomain(domain: DomainKey, resultIndex: number): void {
    const result = results[resultIndex];
    if (result.status === "fulfilled") {
      const value = result.value;
      dispatch({ type: "DOMAIN_LIVE", domain, data: value, syncedAt: new Date().toISOString() });
      savePromises.push(saveSnapshotDomain(token, domain, value as never));
    } else {
      const preloaded = snapshotPreload?.[domain];
      if (preloaded) {
        dispatch({ type: "DOMAIN_SNAPSHOT", domain, data: preloaded.data, syncedAt: preloaded.syncedAt });
      } else {
        dispatch({ type: "DOMAIN_UNAVAILABLE", domain });
      }
    }
  }

  applyListDomain("categories", 1);

  // transactions — unwrap { items, total }
  {
    const txResult = results[2];
    if (txResult.status === "fulfilled") {
      const items = (txResult.value as { items: unknown }).items;
      dispatch({ type: "DOMAIN_LIVE", domain: "transactions", data: items, syncedAt: new Date().toISOString() });
      savePromises.push(saveSnapshotDomain(token, "transactions", items as never));
    } else {
      const preloaded = snapshotPreload?.transactions;
      if (preloaded) {
        dispatch({ type: "DOMAIN_SNAPSHOT", domain: "transactions", data: preloaded.data, syncedAt: preloaded.syncedAt });
      } else {
        dispatch({ type: "DOMAIN_UNAVAILABLE", domain: "transactions" });
      }
    }
  }

  applyListDomain("payables", 3);
  applyListDomain("budgets", 4);
  applyListDomain("goals", 5);
  applyListDomain("cardStatements", 6);

  // Profile and insights — handled outside reducer, not persisted to snapshot
  // (returned to the caller via `extras` instead of being re-fetched)

  // Global error if any essential domain failed
  const anyEssentialFailed = ESSENTIAL_DOMAIN_KEYS.some((_, i) => results[i].status === "rejected");
  if (anyEssentialFailed) {
    dispatch({ type: "SET_ERROR", error: "Alguns dados não puderam ser atualizados." });
  }

  // Await all v2 snapshot writes before signalling completion.
  // This guarantees snapshot is consistent when UI loads.
  await Promise.allSettled(savePromises);

  dispatch({ type: "BOOTSTRAP_COMPLETE" });

  return extras;
}

/**
 * Synchronizes a paginated slice of transactions.
 */
export async function syncTransactionsPage(
  token: string,
  options: PaginationOptions = { page: 1, limit: 50 },
  dispatch?: Dispatch,
): Promise<{ items: Transaction[]; total: number; page: number; limit: number }> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const res = await endpoints.fetchTransactions({ page, limit });
  if (dispatch) {
    dispatch({
      type: "DOMAIN_LIVE",
      domain: "transactions",
      data: res.items,
      syncedAt: new Date().toISOString(),
    });
    void saveSnapshotDomain(token, "transactions", res.items);
  }
  return {
    items: res.items,
    total: res.total,
    page,
    limit,
  };
}
