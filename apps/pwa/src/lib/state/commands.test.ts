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
import { createCommands, OfflineWriteError, type Commands } from "./commands";
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

  // ── Bulk: all remaining command methods online ✓, offline ✗, rejection propagation ─
  it.each([
    ["addAccount", (c: Commands) => c.addAccount({name:"Test",kind:"bank",initialBalanceCents:0})],
    ["updateAccount", (c: Commands) => c.updateAccount("a1",{name:"X"})],
    ["deactivateAccount", (c: Commands) => c.deactivateAccount("a1")],
    ["addCategory", (c: Commands) => c.addCategory({name:"Food",kind:"expense"})],
    ["updateCategory", (c: Commands) => c.updateCategory("c1",{name:"X"})],
    ["deactivateCategory", (c: Commands) => c.deactivateCategory("c1")],
    ["createBudget", (c: Commands) => c.createBudget({categoryId:"c1",name:"B",amountCents:1000,period:"monthly",startDate:"2026-07-01"})],
    ["updateBudget", (c: Commands) => c.updateBudget("b1",{amountCents:2000})],
    ["createGoal", (c: Commands) => c.createGoal({name:"G",goalType:"savings",targetAmountCents:5000,startDate:"2026-07-01"})],
    ["contributeToGoal", (c: Commands) => c.contributeToGoal("g1",{amountCents:1000})],
    ["cancelGoal", (c: Commands) => c.cancelGoal("g1")],
    ["updateGoal", (c: Commands) => c.updateGoal("g1",{name:"G2"})],
    ["cancelSubscription", (c: Commands) => c.cancelSubscription("s1")],
    ["updateSubscription", (c: Commands) => c.updateSubscription("s1",{name:"S2"})],
    ["payStatement", (c: Commands) => c.payStatement("st1",{amountCents:10000,fromAccountId:"a1"})],
    ["createInstallments", (c: Commands) => c.createInstallments({accountId:"a1",description:"X",totalAmountCents:10000,purchaseDate:"2026-07-01",installmentsTotal:3})],
    ["patchProfile", (c: Commands) => c.patchProfile({name:"U"})],
  ])("%s: online resolves, failure propagates, offline rejects", async (name, call) => {
    // Online success: mock resolves, method resolves, CLEAR_WRITE_ERROR dispatched
    vi.spyOn(endpoints, name as keyof typeof endpoints).mockResolvedValue({} as never);
    const dispatch = vi.fn();
    const onlineCmds = createCommands(ctx(true, dispatch));
    await expect(call(onlineCmds)).resolves.toBeDefined();
    expect(dispatch).toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" } satisfies AppStateAction);
    vi.restoreAllMocks();
    // Online failure: mock rejects, method propagates error (catch does NOT swallow)
    vi.spyOn(endpoints, name as keyof typeof endpoints).mockRejectedValue(new Error("api-down"));
    const failDispatch = vi.fn();
    const failCmds = createCommands(ctx(true, failDispatch));
    await expect(call(failCmds)).rejects.toThrow("api-down");
    expect(failDispatch).not.toHaveBeenCalledWith({ type: "CLEAR_WRITE_ERROR" } satisfies AppStateAction);
    vi.restoreAllMocks();
    // Offline: rejects with OfflineWriteError containing method name, no API call
    const spy = vi.spyOn(endpoints, name as keyof typeof endpoints);
    const offlineCmds = createCommands(ctx(false));
    await expect(call(offlineCmds)).rejects.toBeInstanceOf(OfflineWriteError);
    await expect(call(offlineCmds)).rejects.toMatchObject({
      message: expect.stringContaining(name),
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
