/**
 * FIX-P1-RECEIPT-REMAINING-WRITES — TDD RED-first (PWA).
 *
 * endpoints.createInstallments/createCardPurchase resolve `res.items`,
 * stripping the API `{ items, receipt }` envelope; endpoints.undoLastAction
 * hides the undo receipt at the type level. The receipt must flow through
 * the envelope into the returned value so the existing reconciliation
 * mechanism (`extractMutationReceipt` + `reconcileAfterWrite`) consumes the
 * real receipt instead of the registry-kind fallback — with no public API
 * regression (arrays stay arrays, undo stays `{ undone }`-shaped).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "../client";
import * as endpoints from "../endpoints";
import { createCommands, type CommandsContext } from "../../state/commands";
import { extractMutationReceipt } from "../../state/mutation-reconciler";

vi.mock("../client", () => ({ apiFetch: vi.fn() }));
const mocked = vi.mocked(apiFetch);

const RECEIPT = {
  mutationId: "11111111-1111-4111-8111-111111111111",
  mutationKind: "transaction.create",
  status: "succeeded",
  affectedTargets: ["transactions", "accounts", "dashboard-summary", "budgets", "quick-insights"],
} as const;

const UNDO_RECEIPT = {
  mutationId: "22222222-2222-4222-8222-222222222222",
  mutationKind: "transaction.delete",
  status: "succeeded",
  affectedTargets: ["transactions", "accounts", "dashboard-summary", "budgets", "quick-insights"],
} as const;

beforeEach(() => {
  mocked.mockReset();
});

describe("endpoints — receipt preservation (FIX-P1)", () => {
  it("createInstallments keeps items intact and carries the envelope receipt", async () => {
    const items = [{ id: "tx-1" }, { id: "tx-2" }];
    mocked.mockResolvedValue({ items, receipt: RECEIPT } as never);
    const result = await endpoints.createInstallments({
      accountId: "card-1",
      description: "Notebook 3x",
      totalAmountCents: 300000,
      purchaseDate: "2026-06-10",
      installmentsTotal: 3,
    });
    expect(Array.isArray(result)).toBe(true);
    expect([...result]).toEqual([{ id: "tx-1" }, { id: "tx-2" }]);
    expect((result as unknown as { receipt?: unknown }).receipt).toEqual(RECEIPT);
    expect(extractMutationReceipt(result)?.mutationId).toBe(RECEIPT.mutationId);
  });

  it("createInstallments without a receipt still resolves the plain items", async () => {
    const items = [{ id: "tx-1" }];
    mocked.mockResolvedValue({ items } as never);
    const result = await endpoints.createInstallments({
      accountId: "card-1",
      description: "Lanche",
      totalAmountCents: 5000,
      purchaseDate: "2026-06-10",
      installmentsTotal: 1,
    });
    expect([...result]).toEqual(items);
    expect(extractMutationReceipt(result)).toBeUndefined();
  });

  it("createCardPurchase keeps items intact and carries the envelope receipt", async () => {
    const items = [{ id: "tx-9" }];
    mocked.mockResolvedValue({ items, receipt: RECEIPT } as never);
    const result = await endpoints.createCardPurchase({
      accountId: "card-1",
      description: "Mercado",
      amountCents: 15000,
      date: "2026-06-10",
    });
    expect([...result]).toEqual([{ id: "tx-9" }]);
    expect((result as unknown as { receipt?: unknown }).receipt).toEqual(RECEIPT);
    expect(extractMutationReceipt(result)?.mutationId).toBe(RECEIPT.mutationId);
  });

  it("deleteTransaction returns the receipt-carrying deleted entity", async () => {
    const deleted = { id: "tx-1", description: "Café", amountCents: 500 };
    const DELETE_RECEIPT = {
      mutationId: "33333333-3333-4333-8333-333333333333",
      mutationKind: "transaction.delete",
      status: "succeeded",
      affectedTargets: ["transactions", "accounts", "dashboard-summary", "budgets", "quick-insights"],
    } as const;
    mocked.mockResolvedValue({ ...deleted, receipt: DELETE_RECEIPT } as never);
    const result = await endpoints.deleteTransaction("tx-1");
    expect(mocked).toHaveBeenCalledWith(
      "/transactions/tx-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(result).toMatchObject({ id: "tx-1" });
    expect((result as unknown as { receipt?: unknown }).receipt).toEqual(DELETE_RECEIPT);
    expect(extractMutationReceipt(result)?.mutationId).toBe(DELETE_RECEIPT.mutationId);
  });

  it("undoLastAction propagates the undo receipt on the `{ undone }` envelope", async () => {    const undone = {
      operation: "transactions.expense.create",
      entityId: "tx-1",
      reversal: "soft_delete",
    };
    mocked.mockResolvedValue({ undone, receipt: UNDO_RECEIPT } as never);
    const result = await endpoints.undoLastAction();
    expect(result.undone).toEqual(undone);
    expect(result.receipt).toEqual(UNDO_RECEIPT);
    expect(extractMutationReceipt(result)?.mutationId).toBe(UNDO_RECEIPT.mutationId);
  });
});

describe("commands — receipt passthrough to the reconciliation mechanism (FIX-P1)", () => {
  it("createInstallments returns the receipt-carrying value untouched", async () => {
    const items = [{ id: "tx-1" }] as unknown as Awaited<
      ReturnType<typeof endpoints.createInstallments>
    >;
    (items as unknown as { receipt?: unknown }).receipt = RECEIPT;
    const api = { createInstallments: vi.fn().mockResolvedValue(items) };
    const ctx = {
      online: true,
      token: "t",
      dispatch: vi.fn(),
      api,
    } as unknown as CommandsContext;
    const commands = createCommands(ctx);
    const result = await commands.createInstallments({
      accountId: "card-1",
      description: "Notebook 3x",
      totalAmountCents: 300000,
      purchaseDate: "2026-06-10",
      installmentsTotal: 3,
    });
    expect(result).toBe(items);
    expect(extractMutationReceipt(result)?.mutationId).toBe(RECEIPT.mutationId);
  });

  it("createCardPurchase returns the receipt-carrying value untouched", async () => {
    const items = [{ id: "tx-9" }] as unknown as Awaited<
      ReturnType<typeof endpoints.createCardPurchase>
    >;
    (items as unknown as { receipt?: unknown }).receipt = RECEIPT;
    const api = { createCardPurchase: vi.fn().mockResolvedValue(items) };
    const ctx = {
      online: true,
      token: "t",
      dispatch: vi.fn(),
      api,
    } as unknown as CommandsContext;
    const commands = createCommands(ctx);
    const result = await commands.createCardPurchase({
      accountId: "card-1",
      description: "Mercado",
      amountCents: 15000,
      date: "2026-06-10",
    });
    expect(result).toBe(items);
    expect(extractMutationReceipt(result)?.mutationId).toBe(RECEIPT.mutationId);
  });

  it("deleteTransaction returns the receipt-carrying value untouched", async () => {
    const deleted = { id: "tx-1" } as unknown as Awaited<
      ReturnType<typeof endpoints.deleteTransaction>
    >;
    (deleted as unknown as { receipt?: unknown }).receipt = RECEIPT;
    const api = { deleteTransaction: vi.fn().mockResolvedValue(deleted) };
    const ctx = {
      online: true,
      token: "t",
      dispatch: vi.fn(),
      api,
    } as unknown as CommandsContext;
    const commands = createCommands(ctx);
    const result = await commands.deleteTransaction("tx-1");
    expect(result).toBe(deleted);
    expect(extractMutationReceipt(result)?.mutationId).toBe(RECEIPT.mutationId);
  });
});
