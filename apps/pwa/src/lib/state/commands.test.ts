/**
 * Command boundary tests.
 *
 * Representative create / update / delete / pay commands verify the
 * offline invariant: when `online === false`, a command throws
 * `OfflineWriteError` immediately, makes zero network requests, and
 * performs zero optimistic state mutation.
 *
 * On `online === true`, the command delegates to the `api` endpoint and
 * dispatches `CLEAR_WRITE_ERROR` on success.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCommands, OfflineWriteError } from "./commands";
import * as endpoints from "@/lib/api/endpoints";
import type { AppStateAction } from "./state-reducer";

function ctx(online: boolean, dispatch = vi.fn()) {
  return {
    online,
    token: online ? "test-token" : undefined,
    dispatch,
    api: endpoints,
  } as const;
}

describe("commands — offline invariant (representative create/update/delete/pay)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── create ──────────────────────────────────────────────────────
  it("createExpenseTransaction: offline → OfflineWriteError, no request", async () => {
    const spy = vi.spyOn(endpoints, "createExpenseTransaction");
    const commands = createCommands(ctx(false));
    await expect(
      commands.createExpenseTransaction({
        description: "Coffee",
        amountCents: 500,
        date: "2026-07-13",
        categoryId: "c1",
        accountId: "a1",
      }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("createExpenseTransaction: online → calls api and clears writeError", async () => {
    const created = { id: "t1" };
    const spy = vi
      .spyOn(endpoints, "createExpenseTransaction")
      .mockResolvedValue(created as never);
    const dispatch = vi.fn();
    const commands = createCommands(ctx(true, dispatch));
    const result = await commands.createExpenseTransaction({
      description: "Coffee",
      amountCents: 500,
      date: "2026-07-13",
      categoryId: "c1",
      accountId: "a1",
    });
    expect(result).toBe(created);
    expect(spy).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" } satisfies AppStateAction);
  });

  // ── update ──────────────────────────────────────────────────────
  it("updateTransaction: offline → OfflineWriteError, no request", async () => {
    const spy = vi.spyOn(endpoints, "updateTransaction");
    const commands = createCommands(ctx(false));
    await expect(
      commands.updateTransaction("t1", { description: "x" }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("updateTransaction: online → propagates api rejection", async () => {
    vi.spyOn(endpoints, "updateTransaction").mockRejectedValue(
      new Error("network down"),
    );
    const commands = createCommands(ctx(true));
    await expect(
      commands.updateTransaction("t1", { description: "x" }),
    ).rejects.toThrow("network down");
  });

  // ── delete ──────────────────────────────────────────────────────
  it("deleteTransaction: offline → OfflineWriteError, no request", async () => {
    const spy = vi.spyOn(endpoints, "deleteTransaction");
    const commands = createCommands(ctx(false));
    await expect(commands.deleteTransaction("t1")).rejects.toBeInstanceOf(
      OfflineWriteError,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("deleteTransaction: online → calls api", async () => {
    const spy = vi
      .spyOn(endpoints, "deleteTransaction")
      .mockResolvedValue(undefined);
    const commands = createCommands(ctx(true));
    await commands.deleteTransaction("t1");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("t1");
  });

  // ── pay ─────────────────────────────────────────────────────────
  it("markPayablePaid: offline → OfflineWriteError, no request", async () => {
    const spy = vi.spyOn(endpoints, "markPayablePaid");
    const commands = createCommands(ctx(false));
    await expect(
      commands.markPayablePaid("p1", "2026-07-13"),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("markPayablePaid: online → calls api with id + paidDate", async () => {
    const spy = vi
      .spyOn(endpoints, "markPayablePaid")
      .mockResolvedValue({ id: "p1" } as never);
    const commands = createCommands(ctx(true));
    await commands.markPayablePaid("p1", "2026-07-13");
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith("p1", "2026-07-13");
  });

  // ── additional families (cards / payables / transfer) ──────────
  it("createCard: offline → OfflineWriteError", async () => {
    const spy = vi.spyOn(endpoints, "createCard");
    const commands = createCommands(ctx(false));
    await expect(
      commands.createCard({
        name: "Nubank",
        creditLimitCents: 100000,
        closingDay: 1,
        dueDay: 10,
      }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("createPayable: offline → OfflineWriteError", async () => {
    const spy = vi.spyOn(endpoints, "createPayable");
    const commands = createCommands(ctx(false));
    await expect(
      commands.createPayable({
        accountId: "a1",
        description: "Internet",
        amountCents: 9990,
        dueDate: "2026-07-20",
      }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("createTransfer: offline → OfflineWriteError", async () => {
    const spy = vi.spyOn(endpoints, "createTransfer");
    const commands = createCommands(ctx(false));
    await expect(
      commands.createTransfer({
        description: "Move",
        amountCents: 1000,
        date: "2026-07-13",
        fromAccountId: "a1",
        toAccountId: "a2",
      }),
    ).rejects.toBeInstanceOf(OfflineWriteError);
    expect(spy).not.toHaveBeenCalled();
  });
});
