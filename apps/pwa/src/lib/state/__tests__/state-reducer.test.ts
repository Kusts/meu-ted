/**
 * TDD Unit Tests for State Reducer (state-reducer.ts)
 *
 * Covers:
 * - Happy Path: BOOTSTRAP_START, DOMAIN_LIVE updates, full bootstrap cycle, readOnly transitions
 * - Failure Path: BOOTSTRAP_401, DOMAIN_UNAVAILABLE, SET_ERROR, SET_WRITE_ERROR, CLEAR_WRITE_ERROR
 * - Edge / Concurrency: Undefined initial state, unknown action immutability, non-essential domain failures
 */
import { describe, it, expect } from "vitest";
import {
  appStateReducer,
  type AppStateAction,
  type AppStateSnapshot,
  ALL_DOMAIN_KEYS,
  ESSENTIAL_DOMAIN_KEYS,
  type DomainKey,
} from "../state-reducer";
import type { Account, Category } from "../types";

function startState(): AppStateSnapshot {
  return appStateReducer(undefined, { type: "BOOTSTRAP_START" });
}

describe("PWA State Reducer — state-reducer.ts", () => {
  // ── 1. HAPPY PATH (>= 3 cases) ──────────────────────────────────────────────
  describe("Happy Path", () => {
    it("1.1 BOOTSTRAP_START initializes state with loading: true and all domains unavailable", () => {
      const state = startState();
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
      expect(state.writeError).toBeNull();
      expect(state.readOnly).toBe(false);

      for (const d of ALL_DOMAIN_KEYS) {
        expect(state.domains[d].data).toEqual([]);
        expect(state.domains[d].source).toBe("unavailable");
        expect(state.domains[d].syncedAt).toBeNull();
      }
    });

    it("1.2 DOMAIN_LIVE updates the specified domain with source 'live' and syncedAt timestamp", () => {
      const state = startState();
      const accounts: Account[] = [
        {
          id: "acc-1",
          name: "Nubank",
          balanceCents: 50000,
          kind: "checking",
        },
      ];
      const next = appStateReducer(state, {
        type: "DOMAIN_LIVE",
        domain: "accounts",
        data: accounts,
        syncedAt: "2026-08-19T10:00:00.000Z",
      });

      expect(next.domains.accounts.source).toBe("live");
      expect(next.domains.accounts.data).toEqual(accounts);
      expect(next.domains.accounts.syncedAt).toBe("2026-08-19T10:00:00.000Z");
      // Other domains remain unchanged
      expect(next.domains.categories.source).toBe("unavailable");
    });

    it("1.3 Full bootstrap lifecycle transitions all essential domains to LIVE and readOnly becomes false", () => {
      let state = startState();
      const timestamp = "2026-08-19T10:00:00.000Z";

      // Transition all essential domains to live
      for (const domain of ESSENTIAL_DOMAIN_KEYS) {
        state = appStateReducer(state, {
          type: "DOMAIN_LIVE",
          domain,
          data: [{ id: `${domain}-1` }],
          syncedAt: timestamp,
        });
      }

      expect(state.readOnly).toBe(false);

      // Complete bootstrap
      state = appStateReducer(state, { type: "BOOTSTRAP_COMPLETE" });
      expect(state.loading).toBe(false);
      expect(state.readOnly).toBe(false);
    });

    it("1.4 DOMAIN_SNAPSHOT updates domain with source 'snapshot' and retains readOnly true", () => {
      const state = startState();
      const next = appStateReducer(state, {
        type: "DOMAIN_SNAPSHOT",
        domain: "accounts",
        data: [{ id: "acc-snap" }],
        syncedAt: "2026-08-18T10:00:00.000Z",
      });

      expect(next.domains.accounts.source).toBe("snapshot");
      expect(next.domains.accounts.data).toEqual([{ id: "acc-snap" }]);
      expect(next.readOnly).toBe(true);
    });
  });

  // ── 2. FAILURE PATH (>= 3 cases) ────────────────────────────────────────────
  describe("Failure Path", () => {
    it("2.1 BOOTSTRAP_401 finishes loading without altering domain data", () => {
      const state = startState();
      const next = appStateReducer(state, { type: "BOOTSTRAP_401" });
      expect(next.loading).toBe(false);
      expect(next.domains.accounts.source).toBe("unavailable");
    });

    it("2.2 DOMAIN_UNAVAILABLE resets domain to empty array and null syncedAt", () => {
      let state = startState();
      state = appStateReducer(state, {
        type: "DOMAIN_LIVE",
        domain: "payables",
        data: [{ id: "p1" }],
        syncedAt: "2026-08-19T10:00:00.000Z",
      });
      expect(state.domains.payables.source).toBe("live");

      state = appStateReducer(state, {
        type: "DOMAIN_UNAVAILABLE",
        domain: "payables",
      });
      expect(state.domains.payables.source).toBe("unavailable");
      expect(state.domains.payables.data).toEqual([]);
      expect(state.domains.payables.syncedAt).toBeNull();
    });

    it("2.3 SET_ERROR, SET_WRITE_ERROR and CLEAR_WRITE_ERROR manage error states correctly", () => {
      let state = startState();

      state = appStateReducer(state, { type: "SET_ERROR", error: "Falha na conexão" });
      expect(state.error).toBe("Falha na conexão");

      state = appStateReducer(state, { type: "SET_WRITE_ERROR", error: "Erro ao salvar transação" });
      expect(state.writeError).toBe("Erro ao salvar transação");

      state = appStateReducer(state, { type: "CLEAR_WRITE_ERROR" });
      expect(state.writeError).toBeNull();
      expect(state.error).toBe("Falha na conexão"); // Global error unchanged

      state = appStateReducer(state, { type: "SET_ERROR", error: null });
      expect(state.error).toBeNull();
    });
  });

  // ── 3. EDGE & CONCURRENCY CASES (>= 3 cases) ────────────────────────────────
  describe("Edge & Concurrency Cases", () => {
    it("3.1 Initializing reducer with undefined state returns safe initialState without throwing", () => {
      const state = appStateReducer(undefined, { type: "CLEAR_WRITE_ERROR" });
      expect(state).toBeDefined();
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.writeError).toBeNull();
      expect(Object.keys(state.domains)).toHaveLength(ALL_DOMAIN_KEYS.length);
    });

    it("3.2 Unknown action returns identical state reference (pure reducer invariant)", () => {
      const state = startState();
      const unknownAction = { type: "UNKNOWN_ACTION_TYPE_DO_NOT_EXIST" } as unknown as AppStateAction;
      const next = appStateReducer(state, unknownAction);
      expect(next).toBe(state);
    });

    it("3.3 Non-essential domains (subscriptions, cardStatements) going unavailable do not force readOnly=true if all essential domains are live", () => {
      let state = startState();
      const ts = "2026-08-19T10:00:00.000Z";

      // Set all 6 essential domains to live
      for (const d of ESSENTIAL_DOMAIN_KEYS) {
        state = appStateReducer(state, {
          type: "DOMAIN_LIVE",
          domain: d,
          data: [{ id: d }],
          syncedAt: ts,
        });
      }
      expect(state.readOnly).toBe(false);

      // Non-essential domain goes unavailable
      state = appStateReducer(state, {
        type: "DOMAIN_UNAVAILABLE",
        domain: "subscriptions",
      });
      state = appStateReducer(state, {
        type: "DOMAIN_UNAVAILABLE",
        domain: "cardStatements",
      });

      // Essential domains are still live -> readOnly remains false!
      expect(state.readOnly).toBe(false);
    });
  });
});
