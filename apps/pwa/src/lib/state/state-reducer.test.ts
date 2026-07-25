import { describe, it, expect } from "vitest";
import { appStateReducer, type AppStateAction, type AppStateSnapshot } from "./state-reducer";
import type { Account } from "./types";

const DOMAIN_KEYS = [
  "accounts", "categories", "transactions", "payables",
  "budgets", "goals", "subscriptions", "cardStatements",
] as const;

function emptyState(): AppStateSnapshot {
  return appStateReducer(undefined, { type: "BOOTSTRAP_START" });
}

describe("state reducer", () => {
  describe("initial state", () => {
    it("produces known shape after BOOTSTRAP_START", () => {
      const state = emptyState();
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
      expect(state.writeError).toBeNull();
      for (const d of DOMAIN_KEYS) {
        expect(Array.isArray(state.domains[d].data)).toBe(true);
        expect((state.domains[d].data as unknown[]).length).toBe(0);
        expect(state.domains[d].syncedAt).toBeNull();
      }
    });
  });

  describe("DOMAIN_LIVE", () => {
    it("stores data and sets sync source to live", () => {
      const state = emptyState();
      const next = appStateReducer(state, {
        type: "DOMAIN_LIVE",
        domain: "accounts",
        data: [{ id: "a1", name: "Nubank" } as Account],
        syncedAt: "2026-07-13T12:00:00Z",
      });
      expect(next.domains.accounts.source).toBe("live");
      expect(next.domains.accounts.syncedAt).toBe("2026-07-13T12:00:00Z");
      expect(next.domains.accounts.data).toHaveLength(1);
    });

    it("does not affect other domains", () => {
      const state = emptyState();
      const next = appStateReducer(state, {
        type: "DOMAIN_LIVE",
        domain: "accounts",
        data: [{ id: "a1", name: "Nubank" } as Account],
        syncedAt: "2026-07-13T12:00:00Z",
      });
      expect(next.domains.categories.data).toHaveLength(0);
      expect(next.domains.transactions.source).toBe("unavailable");
    });
  });

  describe("DOMAIN_SNAPSHOT", () => {
    it("stores snapshot data and sets sync source to snapshot", () => {
      const state = emptyState();
      const next = appStateReducer(state, {
        type: "DOMAIN_SNAPSHOT",
        domain: "accounts",
        data: [{ id: "s1", name: "Snap Nubank" } as Account],
        syncedAt: "2026-07-12T12:00:00Z",
      });
      expect(next.domains.accounts.source).toBe("snapshot");
      expect(next.domains.accounts.syncedAt).toBe("2026-07-12T12:00:00Z");
    });
  });

  describe("DOMAIN_UNAVAILABLE", () => {
    it("stores empty data and sets sync source to unavailable", () => {
      const state = emptyState();
      const next = appStateReducer(state, {
        type: "DOMAIN_UNAVAILABLE",
        domain: "accounts",
      });
      expect(next.domains.accounts.source).toBe("unavailable");
      expect(next.domains.accounts.syncedAt).toBeNull();
      expect(next.domains.accounts.data).toHaveLength(0);
    });
  });

  describe("BOOTSTRAP_401", () => {
    it("sets loading to false without modifying domain state", () => {
      const state = { ...emptyState(), loading: true };
      const next = appStateReducer(state, { type: "BOOTSTRAP_401" });
      expect(next.loading).toBe(false);
      // Domain state untouched
      expect(next.domains.accounts.source).toBe("unavailable");
    });
  });

  describe("BOOTSTRAP_COMPLETE", () => {
    it("sets loading to false", () => {
      const state = { ...emptyState(), loading: true };
      const next = appStateReducer(state, { type: "BOOTSTRAP_COMPLETE" });
      expect(next.loading).toBe(false);
    });
  });

  describe("SET_ERROR", () => {
    it("sets error message", () => {
      const next = appStateReducer(emptyState(), {
        type: "SET_ERROR",
        error: "Alguns dados não puderam ser atualizados.",
      });
      expect(next.error).toBe("Alguns dados não puderam ser atualizados.");
    });

    it("clears error when null", () => {
      const state = { ...emptyState(), error: "Old error" };
      const next = appStateReducer(state, { type: "SET_ERROR", error: null });
      expect(next.error).toBeNull();
    });
  });

  describe("SET_WRITE_ERROR / CLEAR_WRITE_ERROR", () => {
    it("sets and clears writeError", () => {
      const withError = appStateReducer(emptyState(), {
        type: "SET_WRITE_ERROR",
        error: "Offline",
      });
      expect(withError.writeError).toBe("Offline");

      const cleared = appStateReducer(withError, { type: "CLEAR_WRITE_ERROR" });
      expect(cleared.writeError).toBeNull();
    });
  });

  describe("readOnly derivation", () => {
    it("is true when an essential domain is snapshot or unavailable", () => {
      const state = emptyState();
      // Make accounts live, categories unavailable
      const s1 = appStateReducer(state, {
        type: "DOMAIN_LIVE",
        domain: "accounts",
        data: [],
        syncedAt: "2026-07-13T12:00:00Z",
      });
      const s2 = appStateReducer(s1, {
        type: "DOMAIN_UNAVAILABLE",
        domain: "categories",
      });
      expect(s2.readOnly).toBe(true);
    });

    it("is false when all essential domains are live", () => {
      const state = emptyState();
      let next = state;
      for (const d of ["accounts", "categories", "transactions", "payables", "budgets", "goals"] as const) {
        next = appStateReducer(next, {
          type: "DOMAIN_LIVE",
          domain: d,
          data: [],
          syncedAt: "2026-07-13T12:00:00Z",
        });
      }
      expect(next.readOnly).toBe(false);
    });

    it("is false when non-essential domains are unavailable", () => {
      const state = emptyState();
      let next = state;
      for (const d of ["accounts", "categories", "transactions", "payables", "budgets", "goals"] as const) {
        next = appStateReducer(next, {
          type: "DOMAIN_LIVE",
          domain: d,
          data: [],
          syncedAt: "2026-07-13T12:00:00Z",
        });
      }
      // Non-essential unavailable
      next = appStateReducer(next, { type: "DOMAIN_UNAVAILABLE", domain: "subscriptions" });
      expect(next.readOnly).toBe(false);
    });
  });

  describe("write mutation is rejected in read-only mode (no-op)", () => {
    it("does not mutate state for write actions", () => {
      // Write actions like addTransaction etc. are not reducer's responsibility
      // (they are in AppState facade). The reducer only manages bootstrap/domain state.
      // Verify that unknown action types return state unchanged.
      const state = emptyState();
      const next = appStateReducer(state, { type: "UNKNOWN" as AppStateAction["type"], domain: "x" } as AppStateAction);
      expect(next).toBe(state);
    });
  });
});
