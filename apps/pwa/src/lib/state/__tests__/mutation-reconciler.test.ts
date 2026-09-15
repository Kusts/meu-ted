/**
 * T3.3 — MutationReconciler unit tests (SPEC §15.2–§15.6, §25.6).
 *
 * RED-first: this file is written before
 * `apps/pwa/src/lib/state/mutation-reconciler.ts` exists.
 */
import { describe, it, expect, vi } from "vitest";
import type {
  MutationKind,
  MutationReceipt,
  RefreshTarget,
} from "@pi-finance/llm-contracts/types";
import {
  RECONCILIATION_STALE_MESSAGE,
  extractMutationReceipt,
  resolveReconciliationTargets,
  resolveTedMutationKind,
  createMutationReconciler,
} from "../mutation-reconciler";

function receipt(
  overrides: Partial<MutationReceipt> = {},
): MutationReceipt {
  return {
    mutationId: "mut-1",
    mutationKind: "transaction.create",
    status: "succeeded",
    affectedTargets: [
      "transactions",
      "accounts",
      "dashboard-summary",
      "budgets",
      "quick-insights",
    ],
    ...overrides,
  };
}

describe("resolveReconciliationTargets", () => {
  it("uses receipt.affectedTargets verbatim when a receipt is present", () => {
    const targets = resolveReconciliationTargets({
      receipt: receipt({
        affectedTargets: ["payables", "dashboard-summary", "quick-insights"],
      }),
    });
    expect(targets).toEqual([
      "payables",
      "dashboard-summary",
      "quick-insights",
    ]);
  });

  it("falls back to the registry mapping when no receipt is present", () => {
    expect(
      resolveReconciliationTargets({ mutationKind: "payable.pay" }),
    ).toEqual(["payables", "dashboard-summary", "quick-insights"]);
    expect(
      resolveReconciliationTargets({ mutationKind: "account.create" }),
    ).toEqual(["accounts", "dashboard-summary"]);
  });

  it("throws for an unknown mutation kind without a receipt (never silent)", () => {
    expect(() =>
      resolveReconciliationTargets({
        mutationKind: "nope.unknown" as MutationKind,
      }),
    ).toThrow();
  });

  it("throws when neither receipt nor mutation kind is given", () => {
    expect(() => resolveReconciliationTargets({})).toThrow();
  });
});

describe("extractMutationReceipt", () => {
  it("pulls the receipt additively attached to a normal-write body", () => {
    const r = receipt();
    expect(extractMutationReceipt({ id: "t1", receipt: r })).toEqual(r);
  });

  it("returns undefined when the body carries no receipt", () => {
    expect(extractMutationReceipt({ id: "t1" })).toBeUndefined();
    expect(extractMutationReceipt(null)).toBeUndefined();
    expect(extractMutationReceipt(undefined)).toBeUndefined();
  });

  it("returns undefined for malformed receipt payloads", () => {
    expect(
      extractMutationReceipt({ receipt: { mutationKind: "x" } }),
    ).toBeUndefined();
  });
});

describe("resolveTedMutationKind", () => {
  it("maps V2 approval tools to their registry kinds", () => {
    expect(resolveTedMutationKind("transactions.expense.create")).toBe(
      "transactions.expense.create",
    );
    expect(resolveTedMutationKind("transactions.income.create")).toBe(
      "transactions.income.create",
    );
  });

  it("heuristically maps income operations, defaulting to expense", () => {
    expect(resolveTedMutationKind("transactions.income")).toBe(
      "transactions.income.create",
    );
    expect(resolveTedMutationKind("registrar despesa")).toBe(
      "transactions.expense.create",
    );
  });
});

describe("createMutationReconciler", () => {
  function setup() {
    const calls: RefreshTarget[] = [];
    const refresh = vi.fn(async (target: RefreshTarget) => {
      calls.push(target);
    });
    const reconciler = createMutationReconciler({ refresh });
    return { calls, refresh, reconciler };
  }

  it("refreshes exactly the receipt targets — wrong targets never refreshed", async () => {
    const { calls, reconciler } = setup();
    const result = await reconciler.reconcile({ receipt: receipt() });
    expect(result.deduped).toBe(false);
    expect(result.failed).toEqual([]);
    expect([...calls].sort()).toEqual(
      [
        "transactions",
        "accounts",
        "dashboard-summary",
        "budgets",
        "quick-insights",
      ].sort(),
    );
    for (const wrong of [
      "payables",
      "statement",
      "goals",
      "categories",
      "subscription",
      "agent-conversation",
    ] as RefreshTarget[]) {
      expect(calls).not.toContain(wrong);
    }
  });

  it("reconciles via the mutationKind fallback when the receipt is absent", async () => {
    const { calls, reconciler } = setup();
    await reconciler.reconcile({ mutationKind: "goal.create" });
    expect([...calls].sort()).toEqual(["dashboard-summary", "goals"].sort());
  });

  it("dedups repeated mutationIds — the second receipt refreshes nothing", async () => {
    const { refresh, reconciler } = setup();
    const r = receipt({ mutationId: "dup-1" });
    const first = await reconciler.reconcile({ receipt: r });
    const second = await reconciler.reconcile({ receipt: r });
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(r.affectedTargets.length);
  });

  it("evicts the oldest seen ids once the cap is reached", async () => {
    const refresh = vi.fn(async (_t: RefreshTarget) => {});
    const reconciler = createMutationReconciler({ refresh, maxSeen: 2 });
    const mk = (id: string) => receipt({ mutationId: id });
    await reconciler.reconcile({ receipt: mk("a") });
    await reconciler.reconcile({ receipt: mk("b") });
    await reconciler.reconcile({ receipt: mk("c") });
    // "a" was evicted: reconciling it again must refresh, not dedup.
    const again = await reconciler.reconcile({ receipt: mk("a") });
    expect(again.deduped).toBe(false);
  });

  it("reports failed targets instead of throwing (no rollback of the mutation)", async () => {
    const refresh = vi.fn(async (target: RefreshTarget) => {
      if (target === "dashboard-summary") throw new Error("boom");
    });
    const reconciler = createMutationReconciler({ refresh });
    const result = await reconciler.reconcile({ receipt: receipt() });
    expect(result.failed).toEqual(["dashboard-summary"]);
    expect(result.refreshed).not.toContain("dashboard-summary");
    // every other target was still attempted
    expect(refresh).toHaveBeenCalledTimes(
      receipt().affectedTargets.length,
    );
  });

  it("exposes the pt-BR stale message", () => {
    expect(RECONCILIATION_STALE_MESSAGE).toBe(
      "Lançamento registrado, mas não foi possível atualizar todos os dados.",
    );
  });

  it("reconcileTargets refreshes an explicit list without dedup", async () => {
    const { calls, reconciler } = setup();
    const outcome = await reconciler.reconcileTargets([
      "payables",
      "dashboard-summary",
    ]);
    expect(outcome.failed).toEqual([]);
    expect(calls).toEqual(["payables", "dashboard-summary"]);
  });

  it("setRefresh swaps the refresh callback without losing seen mutationIds", async () => {
    const first = vi.fn(async () => {});
    const reconciler = createMutationReconciler({ refresh: first });
    const r = receipt({ mutationId: "swap-1" });
    await reconciler.reconcile({ receipt: r });
    const second = vi.fn(async () => {});
    reconciler.setRefresh(second);
    // Same instance: dedup preserved across the refresh swap.
    const deduped = await reconciler.reconcile({ receipt: r });
    expect(deduped.deduped).toBe(true);
    expect(second).not.toHaveBeenCalled();
    // New mutations use the swapped refresh.
    const fresh = await reconciler.reconcile({
      receipt: receipt({ mutationId: "swap-2" }),
    });
    expect(fresh.deduped).toBe(false);
    expect(second).toHaveBeenCalled();
    expect(first).toHaveBeenCalledTimes(r.affectedTargets.length);
  });
});
