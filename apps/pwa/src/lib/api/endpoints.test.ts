// Minimal TDD tests for endpoints.ts (was 27% covered). Mock apiFetch and assert
// each endpoint calls it with the correct path/method.
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as endpoints from "./endpoints";
import { apiFetch } from "./client";

vi.mock("./client", () => ({ apiFetch: vi.fn() }));
const mocked = vi.mocked(apiFetch);

function list() {
  return { items: [], total: 0 };
}

beforeEach(() => {
  mocked.mockReset();
  mocked.mockImplementation(async () => list() as never);
});

function pathOf(i = 0): string {
  return String(mocked.mock.calls[i][0]);
}
function methodOf(i = 0): string | undefined {
  return (mocked.mock.calls[i][1] as RequestInit | undefined)?.method;
}

describe("endpoints — reads", () => {
  it("fetchAccounts", async () => {
    await endpoints.fetchAccounts();
    expect(pathOf()).toBe("/accounts");
  });
  it("fetchCategories", async () => {
    await endpoints.fetchCategories();
    expect(pathOf()).toBe("/categories");
  });
  it("fetchTransactions (no params)", async () => {
    await endpoints.fetchTransactions();
    expect(pathOf()).toBe("/transactions");
  });
  it("fetchTransactions (params)", async () => {
    await endpoints.fetchTransactions({ limit: 10, offset: 5, kind: "expense" });
    expect(pathOf()).toBe("/transactions?limit=10&offset=5&kind=expense");
  });
  it("fetchPayables (no params)", async () => {
    await endpoints.fetchPayables();
    expect(pathOf()).toBe("/payables");
  });
  it("fetchPayables (status)", async () => {
    await endpoints.fetchPayables({ status: "pending" });
    expect(pathOf()).toBe("/payables?status=pending");
  });
  it("fetchBudgets", async () => {
    await endpoints.fetchBudgets();
    expect(pathOf()).toBe("/budgets");
  });
  it("fetchGoals", async () => {
    await endpoints.fetchGoals();
    expect(pathOf()).toBe("/goals");
  });
  it("fetchCards", async () => {
    await endpoints.fetchCards();
    expect(pathOf()).toBe("/cards/accounts");
  });
  it("fetchStatements (no account)", async () => {
    await endpoints.fetchStatements();
    expect(pathOf()).toBe("/cards/statements");
  });
  it("fetchStatements (account)", async () => {
    await endpoints.fetchStatements("acc1");
    expect(pathOf()).toBe("/cards/statements?accountId=acc1");
  });
  it("fetchStatementDetail", async () => {
    await endpoints.fetchStatementDetail("st1");
    expect(pathOf()).toBe("/cards/statements/st1");
  });
  it("fetchSubscriptions", async () => {
    await endpoints.fetchSubscriptions();
    expect(pathOf()).toBe("/subscriptions");
  });
  it("fetchProfile", async () => {
    await endpoints.fetchProfile();
    expect(pathOf()).toBe("/profile");
  });
  it("fetchQuickInsights", async () => {
    await endpoints.fetchQuickInsights();
    expect(pathOf()).toBe("/insights/quick");
  });
});

describe("endpoints — writes", () => {
  beforeEach(() => {
    mocked.mockImplementation(async () => ({}) as never);
  });

  it("createExpenseTransaction POST /transactions/expense", async () => {
    await endpoints.createExpenseTransaction({ description: "x", amountCents: 1, categoryId: "c", accountId: "a", date: "2026-01-01" });
    expect(pathOf()).toBe("/transactions/expense");
    expect(methodOf()).toBe("POST");
  });
  it("createIncomeTransaction POST /transactions/income", async () => {
    await endpoints.createIncomeTransaction({ description: "x", amountCents: 1, categoryId: "c", accountId: "a", date: "2026-01-01" });
    expect(pathOf()).toBe("/transactions/income");
    expect(methodOf()).toBe("POST");
  });
  it("createCard POST /cards", async () => {
    await endpoints.createCard({ name: "n", creditLimitCents: 1, closingDay: 1, dueDay: 1 });
    expect(pathOf()).toBe("/cards");
    expect(methodOf()).toBe("POST");
  });
  it("updateCard PATCH /cards/:id", async () => {
    await endpoints.updateCard("c1", { name: "n" });
    expect(pathOf()).toBe("/cards/c1");
    expect(methodOf()).toBe("PATCH");
  });
  it("updateCardPurchase PATCH /cards/purchases/:id", async () => {
    await endpoints.updateCardPurchase("st1", { description: "d", amountCents: 100 });
    expect(pathOf()).toBe("/cards/purchases/st1");
    expect(methodOf()).toBe("PATCH");
  });
  it("payStatement POST /cards/statements/:id/pay", async () => {
    await endpoints.payStatement("st1", { amountCents: 5000, fromAccountId: "acc1" });
    expect(pathOf()).toBe("/cards/statements/st1/pay");
    expect(methodOf()).toBe("POST");
  });
  it("createInstallments POST /cards/installments", async () => {
    await endpoints.createInstallments({ accountId: "a", description: "d", totalAmountCents: 100, installmentsTotal: 3, purchaseDate: "2026-01-01" });
    expect(pathOf()).toBe("/cards/installments");
    expect(methodOf()).toBe("POST");
  });
  it("createCardPurchase POST /cards/purchases with metadata (H-01/M-04)", async () => {
    await endpoints.createCardPurchase({ accountId: "card1", description: "d", amountCents: 100, date: "2026-01-01", categoryId: "c1", subcategoryId: "s1", notes: "n" });
    expect(pathOf()).toBe("/cards/purchases");
    expect(methodOf()).toBe("POST");
  });
  it("createTransfer POST /transfers", async () => {
    await endpoints.createTransfer({ fromAccountId: "a", toAccountId: "b", amountCents: 1, description: "d", date: "2026-01-01" });
    expect(pathOf()).toBe("/transfers");
    expect(methodOf()).toBe("POST");
  });
  it("addAccount POST /accounts", async () => {
    await endpoints.addAccount({ name: "n", kind: "bank", initialBalanceCents: 0 });
    expect(pathOf()).toBe("/accounts");
    expect(methodOf()).toBe("POST");
  });
  it("addCategory POST /categories", async () => {
    await endpoints.addCategory({ name: "n", kind: "expense" });
    expect(pathOf()).toBe("/categories");
    expect(methodOf()).toBe("POST");
  });
  it("addSubscription POST /subscriptions", async () => {
    await endpoints.addSubscription({ name: "n", amountCents: 1, cycle: "monthly", day: 1, paymentMethod: "credit_card" });
    expect(pathOf()).toBe("/subscriptions");
    expect(methodOf()).toBe("POST");
  });
  it("cancelSubscription DELETE /subscriptions/:id/cancel", async () => {
    await endpoints.cancelSubscription("s1");
    expect(pathOf()).toBe("/subscriptions/s1/cancel");
    expect(methodOf()).toBe("POST");
  });
  it("updateSubscription PATCH /subscriptions/:id", async () => {
    await endpoints.updateSubscription("s1", { name: "n" });
    expect(pathOf()).toBe("/subscriptions/s1");
    expect(methodOf()).toBe("PATCH");
  });
  it("updateTransaction PATCH /transactions/:id", async () => {
    await endpoints.updateTransaction("t1", { description: "d" });
    expect(pathOf()).toBe("/transactions/t1");
    expect(methodOf()).toBe("PATCH");
  });
  it("deleteTransaction DELETE /transactions/:id", async () => {
    await endpoints.deleteTransaction("t1");
    expect(pathOf()).toBe("/transactions/t1");
    expect(methodOf()).toBe("DELETE");
  });
  it("updateAccount PATCH /accounts/:id", async () => {
    await endpoints.updateAccount("a1", { name: "n" });
    expect(pathOf()).toBe("/accounts/a1");
    expect(methodOf()).toBe("PATCH");
  });
  it("deactivateAccount DELETE /accounts/:id/deactivate", async () => {
    await endpoints.deactivateAccount("a1");
    expect(pathOf()).toBe("/accounts/a1/deactivate");
    expect(methodOf()).toBe("POST");
  });
  it("updateCategory PATCH /categories/:id", async () => {
    await endpoints.updateCategory("c1", { name: "n" });
    expect(pathOf()).toBe("/categories/c1");
    expect(methodOf()).toBe("PATCH");
  });
  it("deactivateCategory DELETE /categories/:id/deactivate", async () => {
    await endpoints.deactivateCategory("c1");
    expect(pathOf()).toBe("/categories/c1/deactivate");
    expect(methodOf()).toBe("POST");
  });
  it("createPayable POST /payables", async () => {
    await endpoints.createPayable({ accountId: "a", description: "d", amountCents: 1, dueDate: "2026-01-01" });
    expect(pathOf()).toBe("/payables");
    expect(methodOf()).toBe("POST");
  });
  it("cancelPayable DELETE /payables/:id/cancel", async () => {
    await endpoints.cancelPayable("p1");
    expect(pathOf()).toBe("/payables/p1/cancel");
    expect(methodOf()).toBe("POST");
  });
  it("updatePayable PATCH /payables/:id", async () => {
    await endpoints.updatePayable("p1", { description: "d" });
    expect(pathOf()).toBe("/payables/p1");
    expect(methodOf()).toBe("PATCH");
  });
  it("undoPayablePayment POST /payables/:id/unpay", async () => {
    await endpoints.undoPayablePayment("p1", "tx-1");
    expect(pathOf()).toBe("/payables/p1/unpay");
    expect(methodOf()).toBe("POST");
  });
  it("markPayablePaid POST /payables/:id/pay", async () => {
    await endpoints.markPayablePaid("p1");
    expect(pathOf()).toBe("/payables/p1/pay");
    expect(methodOf()).toBe("POST");
  });
  it("createBudget POST /budgets", async () => {
    await endpoints.createBudget({ categoryId: "c", name: "n", amountCents: 1, period: "monthly", startDate: "2026-01-01" });
    expect(pathOf()).toBe("/budgets");
    expect(methodOf()).toBe("POST");
  });
  it("updateBudget PATCH /budgets/:id", async () => {
    await endpoints.updateBudget("b1", { amountCents: 1 });
    expect(pathOf()).toBe("/budgets/b1");
    expect(methodOf()).toBe("PATCH");
  });
  it("createGoal POST /goals", async () => {
    await endpoints.createGoal({ name: "n", goalType: "savings", targetAmountCents: 1, startDate: "2026-01-01" });
    expect(pathOf()).toBe("/goals");
    expect(methodOf()).toBe("POST");
  });
  it("contributeToGoal POST /goals/:id/contribute", async () => {
    await endpoints.contributeToGoal("g1", { amountCents: 500 });
    expect(pathOf()).toBe("/goals/g1/contribute");
    expect(methodOf()).toBe("POST");
  });
  it("cancelGoal POST /goals/:id/cancel", async () => {
    await endpoints.cancelGoal("g1");
    expect(pathOf()).toBe("/goals/g1/cancel");
    expect(methodOf()).toBe("POST");
  });
  it("updateGoal PATCH /goals/:id", async () => {
    await endpoints.updateGoal("g1", { name: "n" });
    expect(pathOf()).toBe("/goals/g1");
    expect(methodOf()).toBe("PATCH");
  });
  it("patchProfile PATCH /profile", async () => {
    await endpoints.patchProfile({ name: "n" });
    expect(pathOf()).toBe("/profile");
    expect(methodOf()).toBe("PATCH");
  });
});
