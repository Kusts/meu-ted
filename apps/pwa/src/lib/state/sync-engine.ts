/**
 * Sync engine — orchestrates the bootstrap data fetch, dispatches
 * reducer actions, and persists to v2 (IndexedDB) snapshot.
 *
 * v2 is canonical: all snapshot reads/writes use IndexedDB, not localStorage.
 * Preloaded snapshot data is optionally passed in for offline bootstrap.
 */

import * as endpoints from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import { isMembershipRevocation } from "@/lib/auth/auth-state-machine";
import { type DomainKey, type AppStateAction, ESSENTIAL_DOMAIN_KEYS } from "./state-reducer";
import { saveSnapshotDomain, saveV3SnapshotDomain } from "./snapshot-store";
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
 * Validated offline identity for V3 snapshot writes (Phase 3, AUTH-02):
 * the server-confirmed user principal + the known current workspace.
 * Identity-keyed writes need no bearer — cookie-only boots persist here.
 */
export interface V3SnapshotIdentity {
  principalId: string;
  workspaceId: string;
}

/**
 * Run the full bootstrap: fetch all domains, classify results, dispatch,
 * and persist live data to v2 snapshot.
 *
 * @param token — snapshot key (token-derived fingerprint). `undefined` on
 *   cookie-only boots: reads still run via the cookie session, but v2
 *   snapshot writes are skipped (never persist a snapshot that cannot be
 *   owner-checked).
 * @param dispatch — dispatches reducer actions
 * @param expireSession — called on 401
 * @param snapshotPreload — optional preloaded v2 snapshot data for offline boot
 * @param v3Identity — validated offline identity: every live domain is also
 *   written to the V3 slot (works cookie-only — no token required)
 * @returns the profile and quick insights fetched during the bootstrap
 */
export async function runBootstrap(
  token: string | undefined,
  dispatch: Dispatch,
  expireSession: () => void,
  snapshotPreload?: SnapshotPreload,
  v3Identity?: V3SnapshotIdentity,
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

  // Runtime 401 short-circuit, plus D10 revocation: a 403
  // workspace_forbidden means the membership is gone — the session is
  // unauthenticated, never offline-capable. expireSession purges the
  // snapshot; no DOMAIN_SNAPSHOT fallback may serve revoked data.
  const unauthorized = results.some(
    (r) => r.status === "rejected" && r.reason instanceof ApiError && r.reason.status === 401,
  );
  const revoked = results.some(
    (r) =>
      r.status === "rejected" &&
      r.reason instanceof ApiError &&
      isMembershipRevocation(r.reason.status, r.reason.code),
  );
  if (unauthorized || revoked) {
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

  // Collect v2 save promises so we await them before BOOTSTRAP_COMPLETE.
  // Skipped cookie-only (token undefined): without an owner-checkable key
  // no snapshot write is safe — Phase 3 (V3) reintroduces it keyed by
  // authenticated identity.
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
      if (token !== undefined) savePromises.push(saveSnapshotDomain(token, "accounts", merged));
      if (v3Identity !== undefined) {
        savePromises.push(
          saveV3SnapshotDomain(v3Identity.principalId, v3Identity.workspaceId, "accounts", merged).catch(() => {}),
        );
      }
    } else if (cardsData.length > 0) {
      merged = cardsData;
      dispatch({ type: "DOMAIN_LIVE", domain: "accounts", data: cardsData, syncedAt: new Date().toISOString() });
      if (token !== undefined) savePromises.push(saveSnapshotDomain(token, "accounts", cardsData));
      if (v3Identity !== undefined) {
        savePromises.push(
          saveV3SnapshotDomain(v3Identity.principalId, v3Identity.workspaceId, "accounts", cardsData).catch(() => {}),
        );
      }
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
      if (token !== undefined) savePromises.push(saveSnapshotDomain(token, domain, value as never));
      if (v3Identity !== undefined) {
        savePromises.push(
          saveV3SnapshotDomain(v3Identity.principalId, v3Identity.workspaceId, domain, value as never).catch(() => {}),
        );
      }
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
      if (token !== undefined) savePromises.push(saveSnapshotDomain(token, "transactions", items as never));
      if (v3Identity !== undefined) {
        savePromises.push(
          saveV3SnapshotDomain(v3Identity.principalId, v3Identity.workspaceId, "transactions", items as never).catch(() => {}),
        );
      }
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
  token: string | undefined,
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
    if (token !== undefined) void saveSnapshotDomain(token, "transactions", res.items);
  }
  return {
    items: res.items,
    total: res.total,
    page,
    limit,
  };
}
