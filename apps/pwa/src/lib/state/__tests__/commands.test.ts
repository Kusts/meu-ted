/**
 * TDD Unit Tests for State Mutators (commands.ts)
 *
 * Covers:
 * - Happy Path: Online mutations delegating to API, dispatching CLEAR_WRITE_ERROR, executing trackWrite
 * - Failure Path: OfflineWriteError rejection, API error propagation, writeError preservation
 * - Edge / Concurrency: Parallel concurrent writes, partial updates, optional fields, token changes
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCommands, OfflineWriteError, type Commands, type CommandsContext } from "../commands";
import * as endpoints from "@/lib/api/endpoints";
import type { AppStateAction } from "../state-reducer";
import { ApiError } from "@/lib/api/client";

function makeContext(
  online: boolean,
  dispatch = vi.fn(),
  trackWrite?: () => () => void,
): CommandsContext {
  return {
    online,
    token: online ? "test-auth-token-123" : undefined,
    dispatch,
    api: endpoints,
    trackWrite,
  };
}

describe("PWA State Mutators — commands.ts", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. HAPPY PATH (>= 3 cases) ──────────────────────────────────────────────
  describe("Happy Path (Online mutations)", () => {
    it("1.1 createExpenseTransaction delegates to API and dispatches CLEAR_WRITE_ERROR", async () => {
      const mockCreated = {
        id: "tx-1",
        description: "Supermercado",
        amountCents: 15000,
        date: "2026-08-19",
        categoryId: "cat-groceries",
        accountId: "acc-bank",
        kind: "expense" as const,
      };
      const apiSpy = vi.spyOn(endpoints, "createExpenseTransaction").mockResolvedValue(mockCreated as never);
      const dispatch = vi.fn();
      const trackCleanup = vi.fn();
      const trackWrite = vi.fn(() => trackCleanup);

      const commands = createCommands(makeContext(true, dispatch, trackWrite));
      const result = await commands.createExpenseTransaction({
        description: "Supermercado",
        amountCents: 15000,
        date: "2026-08-19",
        categoryId: "cat-groceries",
        accountId: "acc-bank",
      });

      expect(result).toEqual(mockCreated);
      expect(apiSpy).toHaveBeenCalledOnce();
      expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" } satisfies AppStateAction);
      expect(trackWrite).toHaveBeenCalledOnce();
      expect(trackCleanup).toHaveBeenCalledOnce();
    });

    it("1.2 updateTransaction sends partial fields and clears write errors", async () => {
      const mockUpdated = { id: "tx-1", description: "Farmácia", amountCents: 4500 };
      const apiSpy = vi.spyOn(endpoints, "updateTransaction").mockResolvedValue(mockUpdated as never);
      const dispatch = vi.fn();

      const commands = createCommands(makeContext(true, dispatch));
      const result = await commands.updateTransaction("tx-1", { description: "Farmácia" });

      expect(result).toEqual(mockUpdated);
      expect(apiSpy).toHaveBeenCalledWith("tx-1", { description: "Farmácia" });
      expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" });
    });

    it("1.3 markPayablePaid delegates with id and date, resolving successfully", async () => {
      const mockPayable = { id: "pay-1", status: "paid" };
      const apiSpy = vi.spyOn(endpoints, "markPayablePaid").mockResolvedValue(mockPayable as never);
      const dispatch = vi.fn();

      const commands = createCommands(makeContext(true, dispatch));
      const result = await commands.markPayablePaid("pay-1", "2026-08-20");

      expect(result).toEqual(mockPayable);
      expect(apiSpy).toHaveBeenCalledWith("pay-1", "2026-08-20");
      expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" });
    });

    it("1.4 patchProfile sends profile updates and clears write error", async () => {
      const mockProfile = { householdId: "h1", name: "Alice", email: "alice@test.com" };
      const apiSpy = vi.spyOn(endpoints, "patchProfile").mockResolvedValue(mockProfile as never);
      const dispatch = vi.fn();

      const commands = createCommands(makeContext(true, dispatch));
      const result = await commands.patchProfile({ name: "Alice" });

      expect(result).toEqual(mockProfile);
      expect(apiSpy).toHaveBeenCalledWith({ name: "Alice" });
      expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" });
    });
  });

  // ── 2. FAILURE PATH (>= 3 cases) ────────────────────────────────────────────
  describe("Failure Path (Offline invariant & API error propagation)", () => {
    it("2.1 Offline execution throws OfflineWriteError immediately with zero network calls", async () => {
      const txSpy = vi.spyOn(endpoints, "createExpenseTransaction");
      const cardSpy = vi.spyOn(endpoints, "createCard");
      const paySpy = vi.spyOn(endpoints, "markPayablePaid");
      const dispatch = vi.fn();

      const offlineCommands = createCommands(makeContext(false, dispatch));

      await expect(
        offlineCommands.createExpenseTransaction({
          description: "Aluguel",
          amountCents: 200000,
          date: "2026-08-19",
          categoryId: "cat-housing",
          accountId: "acc-1",
        }),
      ).rejects.toBeInstanceOf(OfflineWriteError);

      await expect(
        offlineCommands.createCard({
          name: "Nubank Platinum",
          creditLimitCents: 500000,
          closingDay: 5,
          dueDay: 12,
        }),
      ).rejects.toBeInstanceOf(OfflineWriteError);

      await expect(
        offlineCommands.markPayablePaid("p-1", "2026-08-19"),
      ).rejects.toBeInstanceOf(OfflineWriteError);

      expect(txSpy).not.toHaveBeenCalled();
      expect(cardSpy).not.toHaveBeenCalled();
      expect(paySpy).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it("2.2 API error propagates to caller without being swallowed, and does not dispatch CLEAR_WRITE_ERROR", async () => {
      const apiError = new ApiError(500, "server.error", "Internal server error");
      vi.spyOn(endpoints, "createExpenseTransaction").mockRejectedValue(apiError);
      const dispatch = vi.fn();

      const commands = createCommands(makeContext(true, dispatch));

      await expect(
        commands.createExpenseTransaction({
          description: "Falha",
          amountCents: 1000,
          date: "2026-08-19",
          categoryId: "cat-1",
          accountId: "acc-1",
        }),
      ).rejects.toThrow("Internal server error");

      expect(dispatch).not.toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" });
    });

    it("2.3 OfflineWriteError preserves method name in error message", async () => {
      const offlineCommands = createCommands(makeContext(false));
      await expect(offlineCommands.deleteTransaction("t-99")).rejects.toThrowError(
        /deleteTransaction blocked: offline/,
      );
    });
  });

  // ── 3. EDGE & CONCURRENCY CASES (>= 3 cases) ────────────────────────────────
  describe("Edge & Concurrency Cases", () => {
    it("3.1 Multiple concurrent commands execute in parallel and resolve independently", async () => {
      let resolveFirst: (val: unknown) => void;
      const firstPromise = new Promise((r) => { resolveFirst = r; });
      let resolveSecond: (val: unknown) => void;
      const secondPromise = new Promise((r) => { resolveSecond = r; });

      vi.spyOn(endpoints, "createExpenseTransaction")
        .mockImplementationOnce(() => firstPromise as never)
        .mockImplementationOnce(() => secondPromise as never);

      const dispatch = vi.fn();
      const commands = createCommands(makeContext(true, dispatch));

      const p1 = commands.createExpenseTransaction({
        description: "Primeiro",
        amountCents: 1000,
        date: "2026-08-19",
        categoryId: "c1",
        accountId: "a1",
      });

      const p2 = commands.createExpenseTransaction({
        description: "Segundo",
        amountCents: 2000,
        date: "2026-08-19",
        categoryId: "c2",
        accountId: "a2",
      });

      resolveSecond!({ id: "tx-2" });
      const res2 = await p2;
      expect(res2).toEqual({ id: "tx-2" });

      resolveFirst!({ id: "tx-1" });
      const res1 = await p1;
      expect(res1).toEqual({ id: "tx-1" });

      expect(dispatch).toHaveBeenCalledTimes(2);
    });

    it("3.2 Handles empty and optional inputs cleanly", async () => {
      const mockUpdated = { id: "budget-1", amountCents: 3000 };
      const apiSpy = vi.spyOn(endpoints, "updateBudget").mockResolvedValue(mockUpdated as never);
      const commands = createCommands(makeContext(true));

      const result = await commands.updateBudget("budget-1", {});
      expect(result).toEqual(mockUpdated);
      expect(apiSpy).toHaveBeenCalledWith("budget-1", {});
    });

    it("3.3 trackWrite lifecycle is honored when provided or omitted", async () => {
      const apiSpy = vi.spyOn(endpoints, "cancelPayable").mockResolvedValue(undefined as never);

      // Without trackWrite
      const commandsNoTrack = createCommands(makeContext(true));
      await expect(commandsNoTrack.cancelPayable("pay-1")).resolves.toBeUndefined();

      // With trackWrite
      const cleanup = vi.fn();
      const trackWrite = vi.fn(() => cleanup);
      const commandsWithTrack = createCommands(makeContext(true, vi.fn(), trackWrite));
      await expect(commandsWithTrack.cancelPayable("pay-2")).resolves.toBeUndefined();

      expect(trackWrite).toHaveBeenCalledOnce();
      expect(cleanup).toHaveBeenCalledOnce();
      expect(apiSpy).toHaveBeenCalledTimes(2);
    });
  });
});
