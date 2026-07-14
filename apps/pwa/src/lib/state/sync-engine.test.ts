import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runBootstrap } from "./sync-engine";
import type { AppStateAction } from "./state-reducer";
import * as endpoints from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/client";
import type { Account } from "./types";
import * as snapshotStore from "./snapshot-store";

function mockAccount(id: string, name: string): Account {
  return {
    id, name, kind: "checking", balanceCents: 0,
  } as Account;
}

describe("sync engine — runBootstrap", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(snapshotStore, "saveSnapshotDomain").mockResolvedValue(undefined);
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });

  it("dispatches BOOTSTRAP_START then individual DOMAIN_LIVE for each domain", async () => {
    const dispatched: AppStateAction[] = [];
    const dispatch = (a: AppStateAction) => { dispatched.push(a); };

    // Mock all 10 endpoints to resolve
    vi.spyOn(endpoints, "fetchAccounts").mockResolvedValue([mockAccount("a1", "Nubank")]);
    vi.spyOn(endpoints, "fetchCategories").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchTransactions").mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(endpoints, "fetchPayables").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchBudgets").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchGoals").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchStatements").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchCards").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchProfile").mockResolvedValue(null);
    vi.spyOn(endpoints, "fetchQuickInsights").mockResolvedValue([]);

    const expireSession = vi.fn();
    await runBootstrap("test-token", dispatch, expireSession);

    // First action should be BOOTSTRAP_START
    expect(dispatched[0].type).toBe("BOOTSTRAP_START");
    // All essential domains get live
    const liveDomains = dispatched.filter((a) => a.type === "DOMAIN_LIVE");
    expect(liveDomains.length).toBeGreaterThanOrEqual(6);
    // Last action should be BOOTSTRAP_COMPLETE
    const last = dispatched[dispatched.length - 1];
    expect(last.type).toBe("BOOTSTRAP_COMPLETE");
  });

  it("dispatches BOOTSTRAP_401 when a read returns 401", async () => {
    const dispatched: AppStateAction[] = [];
    const dispatch = (a: AppStateAction) => { dispatched.push(a); };

    vi.spyOn(endpoints, "fetchAccounts").mockRejectedValue(
      new ApiError(401, "auth.error", "Token inválido"),
    );
    // Other endpoints are NOT mocked — they won't be reached because
    // the 401 short-circuit happens after Promise.allSettled resolves.

    const expireSession = vi.fn();
    await runBootstrap("test-token", dispatch, expireSession);

    // Should dispatch BOOTSTRAP_401 (not BOOTSTRAP_COMPLETE)
    expect(dispatched.some((a) => a.type === "BOOTSTRAP_401")).toBe(true);
    expect(dispatched.some((a) => a.type === "BOOTSTRAP_COMPLETE")).toBe(false);
    // expireSession should be called
    expect(expireSession).toHaveBeenCalled();
  });

  it("dispatches DOMAIN_UNAVAILABLE for failed essential domains with no snapshot", async () => {
    const dispatched: AppStateAction[] = [];
    const dispatch = (a: AppStateAction) => { dispatched.push(a); };

    vi.spyOn(endpoints, "fetchAccounts").mockRejectedValue(new Error("Network error"));
    vi.spyOn(endpoints, "fetchCategories").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchTransactions").mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(endpoints, "fetchPayables").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchBudgets").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchGoals").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchStatements").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchCards").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchProfile").mockResolvedValue(null);
    vi.spyOn(endpoints, "fetchQuickInsights").mockResolvedValue([]);

    const expireSession = vi.fn();
    await runBootstrap("test-token", dispatch, expireSession);

    const unavailable = dispatched.filter((a) => a.type === "DOMAIN_UNAVAILABLE");
    const accountsUnavailable = unavailable.some(
      (a) => a.type === "DOMAIN_UNAVAILABLE",
    );
    expect(accountsUnavailable).toBe(true);
    const live = dispatched.filter((a) => a.type === "DOMAIN_LIVE");
    const categoriesLive = live.some(
      (a) => a.type === "DOMAIN_LIVE",
    );
    expect(categoriesLive).toBe(true);
    expect(dispatched.some((a) => a.type === "SET_ERROR")).toBe(true);
  });

  it("sets error when essential domain fails", async () => {
    const dispatched: AppStateAction[] = [];
    const dispatch = (a: AppStateAction) => { dispatched.push(a); };

    vi.spyOn(endpoints, "fetchAccounts").mockResolvedValue([mockAccount("a1", "Nubank")]);
    vi.spyOn(endpoints, "fetchCategories").mockRejectedValue(new Error("Categories down"));
    vi.spyOn(endpoints, "fetchTransactions").mockResolvedValue({ items: [], total: 0 });
    vi.spyOn(endpoints, "fetchPayables").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchBudgets").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchGoals").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchStatements").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchCards").mockResolvedValue([]);
    vi.spyOn(endpoints, "fetchProfile").mockResolvedValue(null);
    vi.spyOn(endpoints, "fetchQuickInsights").mockResolvedValue([]);

    const expireSession = vi.fn();
    await runBootstrap("test-token", dispatch, expireSession);

    expect(dispatched.some((a) => a.type === "SET_ERROR" && a.error !== null)).toBe(true);
  });
});
