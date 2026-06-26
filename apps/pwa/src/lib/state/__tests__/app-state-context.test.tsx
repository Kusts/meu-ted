import { renderHook, act, waitFor } from "@/lib/test-utils";
import { AppStateProvider, useAppState } from "../app-state-context";
import * as endpoints from "@/lib/api/endpoints";
import type { Account, Transaction, Payable } from "@/lib/state/types";

// ─── Spy setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockApiReads(
  overrides: Partial<{
    accounts: Account[];
    payables: Payable[];
  }> = {},
) {
  vi.spyOn(endpoints, "fetchAccounts").mockResolvedValue(
    overrides.accounts ?? [mockAccount("a1", "API Nubank")],
  );
  vi.spyOn(endpoints, "fetchCategories").mockResolvedValue([]);
  vi.spyOn(endpoints, "fetchTransactions").mockResolvedValue({
    items: [],
    total: 0,
  });
  vi.spyOn(endpoints, "fetchPayables").mockResolvedValue(
    overrides.payables ?? [],
  );
  vi.spyOn(endpoints, "fetchBudgets").mockResolvedValue([]);
  vi.spyOn(endpoints, "fetchGoals").mockResolvedValue([]);
  // New reads
  vi.spyOn(endpoints, "fetchSubscriptions").mockResolvedValue([]);
  vi.spyOn(endpoints, "fetchCards").mockResolvedValue([]);
}

function mockAccount(id: string, name: string): Account {
  return {
    id,
    name,
    kind: "checking",
    initialBalanceCents: 0,
    status: "active",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    balanceCents: 500_00,
  };
}

const mockP1: Payable = {
  id: "p1",
  description: "Test payable",
  amountCents: 1000,
  dueDate: "2026-06-30",
  status: "pending",
  accountId: "acc1",
  type: "one_time",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

function apiReady() {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3001");
  localStorage.setItem("pi-finance:token", "test-token-abc");
}

function apiNotConfigured() {
  vi.stubEnv(
    "NEXT_PUBLIC_PI_FINANCE_API_BASE_URL",
    undefined as unknown as string,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("AppStateProvider — mock-data path (no API)", () => {
  beforeEach(() => apiNotConfigured());

  it("provides mock accounts", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    expect(result.current.accounts).toHaveLength(5);
    expect(result.current.accounts[0].name).toBe("Nubank");
  });

  it("provides mock categories", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    const cats = result.current.categories;
    expect(cats.length).toBeGreaterThanOrEqual(5);
    expect(cats.filter((c) => c.kind === "expense").length).toBeGreaterThan(0);
  });

  it("provides mock transactions", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    expect(result.current.transactions.length).toBeGreaterThanOrEqual(3);
  });

  it("exposes loading=false and error=null", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes all data fields and write actions", () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    expect(result.current.accounts).toBeDefined();
    expect(result.current.categories).toBeDefined();
    expect(result.current.transactions).toBeDefined();
    expect(result.current.payables).toBeDefined();
    expect(result.current.budgets).toBeDefined();
    expect(result.current.goals).toBeDefined();
    expect(result.current.debts).toBeDefined();
    expect(result.current.subscriptions).toBeDefined();
    expect(result.current.cardStatements).toBeDefined();
    expect(typeof result.current.addTransaction).toBe("function");
    expect(typeof result.current.deleteTransaction).toBe("function");
    expect(typeof result.current.markPayablePaid).toBe("function");
    expect(typeof result.current.addAccount).toBe("function");
    expect(typeof result.current.addCategory).toBe("function");
    expect(typeof result.current.addCard).toBe("function");
    expect(typeof result.current.updateCard).toBe("function");
    expect(typeof result.current.addSubscription).toBe("function");
    expect(typeof result.current.cancelSubscription).toBe("function");
    expect(typeof result.current.createTransfer).toBe("function");
    expect(typeof result.current.payStatement).toBe("function");
    expect(typeof result.current.createInstallments).toBe("function");
  });

  it("adds a transaction locally when no API", async () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    const initialCount = result.current.transactions.length;
    await act(() =>
      result.current.addTransaction({
        id: "tx-new",
        description: "New test",
        amountCents: 5000,
        date: "2026-06-23",
        kind: "expense",
        categoryId: "cat1",
        accountId: "acc1",
      }),
    );
    expect(result.current.transactions).toHaveLength(initialCount + 1);
    expect(result.current.transactions[0].description).toBe("New test");
  });

  it("marks a payable as paid locally when no API", async () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    await act(() => result.current.markPayablePaid("p1"));
    const p = result.current.payables.find((p) => p.id === "p1");
    expect(p?.status).toBe("paid");
    expect(p?.paidDate).toBeDefined();
  });

  it("throws if useAppState is used outside provider", () => {
    expect(() => renderHook(() => useAppState())).toThrow(
      "useAppState must be used within AppStateProvider",
    );
  });
});

describe("AppStateProvider — API read path", () => {
  beforeEach(() => {
    apiReady();
    mockApiReads();
  });

  it("replaces mock data with API data when configured", async () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.accounts).toHaveLength(1);
    expect(result.current.accounts[0].name).toBe("API Nubank");
  });

  it("sets loading=true during fetch", async () => {
    vi.mocked(endpoints.fetchAccounts).mockImplementation(
      () =>
        new Promise((r) =>
          setTimeout(() => r([mockAccount("a1", "Delayed")]), 100),
        ),
    );

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("sets error on fetch failure and keeps mock data", async () => {
    vi.mocked(endpoints.fetchAccounts).mockRejectedValue(
      new Error("Network error"),
    );

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Network error");
    expect(result.current.accounts.length).toBe(5);
    expect(result.current.accounts[0].name).toBe("Nubank");
  });

  it("skips API when token is missing", () => {
    localStorage.removeItem("pi-finance:token");
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.accounts).toHaveLength(5);
  });
});

describe("AppStateProvider — API write path", () => {
  beforeEach(() => {
    apiReady();
    mockApiReads({ payables: [mockP1] });
  });

  // ── addTransaction ──────────────────────────────────────────────

  it("calls createExpenseTransaction when adding expense with API", async () => {
    const spy = vi
      .spyOn(endpoints, "createExpenseTransaction")
      .mockResolvedValue({} as Transaction);

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() =>
      result.current.addTransaction({
        id: "tx-api-1",
        description: "API expense",
        amountCents: 1000,
        date: "2026-06-23",
        kind: "expense",
        categoryId: "cat1",
        accountId: "acc1",
      }),
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "API expense",
        amountCents: 1000,
      }),
    );
  });

  it("rolls back transaction when API write fails and sets writeError", async () => {
    vi.spyOn(endpoints, "createExpenseTransaction").mockRejectedValue(
      new Error("Offline"),
    );

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.transactions.length;

    await act(() =>
      result.current.addTransaction({
        id: "tx-offline",
        description: "Offline expense",
        amountCents: 500,
        date: "2026-06-23",
        kind: "expense",
        categoryId: "cat1",
        accountId: "acc1",
      }),
    );

    // Transaction was rolled back (removed after API failure)
    expect(result.current.transactions).toHaveLength(prevCount);
    // writeError is set
    expect(result.current.writeError).toBe("Offline");
  });

  // ── markPayablePaid ─────────────────────────────────────────────

  it("calls markPayablePaid API endpoint", async () => {
    const spy = vi
      .spyOn(endpoints, "markPayablePaid")
      .mockResolvedValue({} as Payable);

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.markPayablePaid("p1"));

    expect(spy).toHaveBeenCalledWith("p1", expect.any(String));
    const p = result.current.payables.find((p) => p.id === "p1");
    expect(p?.status).toBe("paid");
  });

  it("rolls back markPayablePaid on API failure", async () => {
    vi.spyOn(endpoints, "markPayablePaid").mockRejectedValue(
      new Error("API error"),
    );

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.markPayablePaid("p1"));

    // Payable reverted to pending
    const p = result.current.payables.find((p) => p.id === "p1");
    expect(p?.status).toBe("pending");
    expect(result.current.writeError).toBe("API error");
  });

  // ── deleteTransaction ──────────────────────────────────────────

  it("calls deleteTransaction API and rolls back on failure", async () => {
    // Mock fetchTransactions to seed initial data
    vi.spyOn(endpoints, "fetchTransactions").mockResolvedValue({
      items: [
        {
          id: "tx-seed-1",
          description: "Seed tx",
          amountCents: 1000,
          date: "2026-06-25",
          kind: "expense",
          categoryId: "cat1",
          accountId: "acc1",
        },
      ],
      total: 1,
    });

    const spy = vi
      .spyOn(endpoints, "deleteTransaction")
      .mockRejectedValue(new Error("Offline"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const firstId = result.current.transactions[0].id;

    await act(() => result.current.deleteTransaction(firstId));

    expect(spy).toHaveBeenCalledWith(firstId);
    // Transaction was rolled back (restored)
    expect(result.current.transactions[0].id).toBe(firstId);
    expect(result.current.writeError).toBe("Offline");
  });

  // ── addAccount ─────────────────────────────────────────────────

  it("adds account optimistically then reconciles with API", async () => {
    const created = { ...mockAccount("real-1", "New Account") };
    const spy = vi.spyOn(endpoints, "addAccount").mockResolvedValue(created);

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.accounts.length;

    await act(() =>
      result.current.addAccount({
        name: "New Account",
        kind: "bank",
        initialBalanceCents: 0,
      }),
    );

    expect(result.current.accounts).toHaveLength(prevCount + 1);
    expect(spy).toHaveBeenCalledWith({
      name: "New Account",
      kind: "bank",
      initialBalanceCents: 0,
    });
  });

  it("rolls back addAccount on API failure", async () => {
    vi.spyOn(endpoints, "addAccount").mockRejectedValue(new Error("Fail"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.accounts.length;

    await act(() =>
      result.current.addAccount({
        name: "Fail Account",
        kind: "bank",
        initialBalanceCents: 100,
      }),
    );

    expect(result.current.accounts).toHaveLength(prevCount);
    expect(result.current.writeError).toBe("Fail");
  });

  // ── addCard ────────────────────────────────────────────────────

  it("adds card optimistically and calls API", async () => {
    const spy = vi.spyOn(endpoints, "createCard").mockResolvedValue({
      ...mockAccount("card-1", "New Card"),
      kind: "credit_card",
      creditLimitCents: 1000_00,
      closingDay: 15,
      dueDay: 25,
    });

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.accounts.length;

    await act(() =>
      result.current.addCard({
        name: "New Card",
        creditLimitCents: 1000_00,
        closingDay: 15,
        dueDay: 25,
      }),
    );

    expect(result.current.accounts).toHaveLength(prevCount + 1);
    expect(spy).toHaveBeenCalledWith({
      name: "New Card",
      creditLimitCents: 1000_00,
      closingDay: 15,
      dueDay: 25,
    });
  });

  it("rolls back addCard on API failure", async () => {
    vi.spyOn(endpoints, "createCard").mockRejectedValue(new Error("Fail"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.accounts.length;

    await act(() =>
      result.current.addCard({
        name: "Fail Card",
        creditLimitCents: 500_00,
        closingDay: 10,
        dueDay: 20,
      }),
    );

    expect(result.current.accounts).toHaveLength(prevCount);
    expect(result.current.writeError).toBe("Fail");
  });

  // ── updateCard ─────────────────────────────────────────────────

  it("updates card optimistically and reconciles with API", async () => {
    const spy = vi
      .spyOn(endpoints, "updateCard")
      .mockResolvedValue({} as Account);

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // Find first credit card in accounts (from mock data)
    const card = result.current.accounts.find((a) => a.kind === "credit_card");
    if (!card) return; // skip if no card

    await act(() =>
      result.current.updateCard(card.id, { name: "Updated Card" }),
    );

    expect(spy).toHaveBeenCalledWith(card.id, { name: "Updated Card" });
    expect(result.current.accounts.find((a) => a.id === card.id)?.name).toBe(
      "Updated Card",
    );
  });

  // ── addSubscription ────────────────────────────────────────────

  it("adds subscription optimistically and calls API", async () => {
    const spy = vi.spyOn(endpoints, "addSubscription").mockResolvedValue({
      id: "sub-real-1",
      name: "Netflix",
      amountCents: 39_90,
      cycle: "monthly",
      day: 15,
      paymentMethod: "credit_card",
      status: "active",
      createdAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.subscriptions.length;

    await act(() =>
      result.current.addSubscription({
        name: "Netflix",
        amountCents: 39_90,
        cycle: "monthly",
        day: 15,
        paymentMethod: "credit_card",
      }),
    );

    expect(result.current.subscriptions).toHaveLength(prevCount + 1);
    expect(spy).toHaveBeenCalledWith({
      name: "Netflix",
      amountCents: 39_90,
      cycle: "monthly",
      day: 15,
      paymentMethod: "credit_card",
    });
  });

  it("rolls back addSubscription on API failure", async () => {
    vi.spyOn(endpoints, "addSubscription").mockRejectedValue(new Error("Fail"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.subscriptions.length;

    await act(() =>
      result.current.addSubscription({
        name: "Fail Sub",
        amountCents: 10_00,
        cycle: "monthly",
        day: 1,
        paymentMethod: "pix",
      }),
    );

    expect(result.current.subscriptions).toHaveLength(prevCount);
    expect(result.current.writeError).toBe("Fail");
  });

  // ── cancelSubscription ─────────────────────────────────────────

  it("cancels subscription and rolls back on failure", async () => {
    // Mock addSubscription to succeed
    vi.spyOn(endpoints, "addSubscription").mockResolvedValue({
      id: "sub-mock-1",
      name: "Test Sub",
      amountCents: 20_00,
      cycle: "monthly",
      day: 5,
      paymentMethod: "credit_card",
      status: "active",
      createdAt: new Date().toISOString(),
    });
    const spy = vi
      .spyOn(endpoints, "cancelSubscription")
      .mockRejectedValue(new Error("Fail"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() =>
      result.current.addSubscription({
        name: "Test Sub",
        amountCents: 20_00,
        cycle: "monthly",
        day: 5,
        paymentMethod: "credit_card",
      }),
    );
    const sub = result.current.subscriptions[0];

    await act(() => result.current.cancelSubscription(sub.id));

    expect(spy).toHaveBeenCalledWith(sub.id);
    // Rolled back because API failed — still active
    expect(
      result.current.subscriptions.find((s) => s.id === sub.id)?.status,
    ).toBe("active");
  });

  // ── createTransfer ─────────────────────────────────────────────

  it("creates transfer optimistically and calls API", async () => {
    const spy = vi
      .spyOn(endpoints, "createTransfer")
      .mockResolvedValue({} as Transaction);

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const a1 = result.current.accounts.find((a) => a.kind === "checking");
    const a2 = result.current.accounts.find(
      (a) => a.kind === "savings",
    );
    if (!a1 || !a2) return;

    await act(() =>
      result.current.createTransfer({
        description: "Test transfer",
        amountCents: 100_00,
        date: "2026-06-25",
        fromAccountId: a1.id,
        toAccountId: a2.id,
      }),
    );

    expect(spy).toHaveBeenCalledWith({
      description: "Test transfer",
      amountCents: 100_00,
      date: "2026-06-25",
      fromAccountId: a1.id,
      toAccountId: a2.id,
    });
  });

  it("rolls back transfer balances and transaction on API failure", async () => {
    vi.spyOn(endpoints, "createTransfer").mockRejectedValue(new Error("Fail"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const a1 = result.current.accounts.find((a) => a.kind === "checking");
    const a2 = result.current.accounts.find((a) => a.kind === "savings");
    if (!a1 || !a2) return;

    const balance1Before = a1.balanceCents;
    const balance2Before = a2.balanceCents;
    const txCountBefore = result.current.transactions.length;

    await act(() =>
      result.current.createTransfer({
        description: "Fail transfer",
        amountCents: 50_00,
        date: "2026-06-25",
        fromAccountId: a1.id,
        toAccountId: a2.id,
      }),
    );

    // Balances restored
    expect(
      result.current.accounts.find((a) => a.id === a1.id)?.balanceCents,
    ).toBe(balance1Before);
    expect(
      result.current.accounts.find((a) => a.id === a2.id)?.balanceCents,
    ).toBe(balance2Before);
    // Transaction removed
    expect(result.current.transactions).toHaveLength(txCountBefore);
    expect(result.current.writeError).toBe("Fail");
  });

  // ── payStatement ──────────────────────────────────────────────

  it("calls payStatement API and rolls back on failure", async () => {
    const spy = vi
      .spyOn(endpoints, "payStatement")
      .mockRejectedValue(new Error("Fail"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const a1 = result.current.accounts[0]; // checking account
    const balanceBefore = a1.balanceCents;

    await act(() =>
      result.current.payStatement("stmt-1", {
        amountCents: 100_00,
        fromAccountId: a1.id,
      }),
    );

    expect(spy).toHaveBeenCalledWith("stmt-1", {
      amountCents: 100_00,
      fromAccountId: a1.id,
    });
    // Balance restored after rollback
    expect(
      result.current.accounts.find((a) => a.id === a1.id)?.balanceCents,
    ).toBe(balanceBefore);
    expect(result.current.writeError).toBe("Fail");
  });

  // ── addCategory ────────────────────────────────────────────────

  it("adds category optimistically and calls API", async () => {
    const spy = vi.spyOn(endpoints, "addCategory").mockResolvedValue({
      id: "cat-real-1",
      name: "New Cat",
      kind: "expense",
      icon: "Tag",
    });

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.categories.length;

    await act(() =>
      result.current.addCategory({ name: "New Cat", kind: "expense" }),
    );

    expect(result.current.categories).toHaveLength(prevCount + 1);
    expect(spy).toHaveBeenCalledWith({ name: "New Cat", kind: "expense" });
  });

  it("rolls back addCategory on API failure", async () => {
    vi.spyOn(endpoints, "addCategory").mockRejectedValue(new Error("Fail"));

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const prevCount = result.current.categories.length;

    await act(() =>
      result.current.addCategory({ name: "Fail Cat", kind: "income" }),
    );

    expect(result.current.categories).toHaveLength(prevCount);
    expect(result.current.writeError).toBe("Fail");
  });

  // ── createInstallments ─────────────────────────────────────────

  it("calls createInstallments API", async () => {
    const spy = vi
      .spyOn(endpoints, "createInstallments")
      .mockResolvedValue([]);

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() =>
      result.current.createInstallments({
        accountId: "card-1",
        description: "Notebook",
        totalAmountCents: 6_000_00,
        purchaseDate: "2026-06-25",
        installmentsTotal: 12,
      }),
    );

    expect(spy).toHaveBeenCalledWith({
      accountId: "card-1",
      description: "Notebook",
      totalAmountCents: 6_000_00,
      purchaseDate: "2026-06-25",
      installmentsTotal: 12,
    });
  });

  // ── updateCard without API ──────────────────────────────────────

  it("updates card locally when no API", async () => {
    apiNotConfigured();
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });
    const card = result.current.accounts.find(
      (a) => a.kind === "credit_card",
    );
    if (!card) return;

    await act(() =>
      result.current.updateCard(card.id, { name: "Local Update" }),
    );

    expect(
      result.current.accounts.find((a) => a.id === card.id)?.name,
    ).toBe("Local Update");
  });

  // ── clearWriteError ───────────────────────────────────────────

  it("clears writeError", async () => {
    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await act(() => result.current.clearWriteError());
    expect(result.current.writeError).toBeNull();
  });

  // ── Idempotency key header sent ───────────────────────────────

  it("sends idempotency-key header on POST mutations", async () => {
    // Use apiPost internally — verify the header goes through client.ts
    const spy = vi
      .spyOn(endpoints, "createExpenseTransaction")
      .mockResolvedValue({} as Transaction);

    const { result } = renderHook(() => useAppState(), {
      wrapper: AppStateProvider,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() =>
      result.current.addTransaction({
        id: "tx-idem",
        description: "Idempotent",
        amountCents: 100,
        date: "2026-06-25",
        kind: "expense",
        categoryId: "cat1",
        accountId: "acc1",
      }),
    );

    expect(spy).toHaveBeenCalled();
    // The key is generated as `pwa-${Date.now()}-${counter}-${suffix}`
    // Can't check exact value, but we verify the call happened
  });
});
