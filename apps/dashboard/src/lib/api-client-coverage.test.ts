// Dashboard API Client - Coverage Tests
import { describe, expect, test, vi, beforeEach } from "vitest";
import { createApiClient } from "./api-client.js";

describe("Dashboard - API Client Coverage", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function createTrackedClient() {
    const calls = [];
    const mockFetch = vi.fn().mockImplementation(async (url, init) => {
      const capturedUrl = typeof url === "string" ? url : String(url);
      calls.push({ url: capturedUrl, init: init || {} });
      return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) } as any;
    });
    const client = createApiClient("http://localhost:3000", mockFetch as any);
    return { client, calls };
  }

  test("health() calls GET /health", async () => {
    const { client, calls } = createTrackedClient();
    await client.health().catch(() => {});
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].url).toContain("/health");
  });

  test("listAccounts() calls GET /accounts", async () => {
    const { client, calls } = createTrackedClient();
    await client.listAccounts("hh-123");
    expect(calls[0].url).toContain("/accounts");
    expect(calls[0].url).toContain("householdId=hh-123");
  });

  test("createAccount() calls POST /accounts", async () => {
    const { client, calls } = createTrackedClient();
    await client.createAccount({ householdId: "hh-1", name: "Conta", type: "checking" });
    expect(calls[0].url).toContain("/accounts");
    expect(calls[0].init.method).toBe("POST");
  });

  test("listCategories() calls GET /categories", async () => {
    const { client, calls } = createTrackedClient();
    await client.listCategories("hh-123");
    expect(calls[0].url).toContain("/categories");
  });

  test("findOrCreateCategory() calls POST /categories/find-or-create", async () => {
    const { client, calls } = createTrackedClient();
    await client.findOrCreateCategory({ householdId: "hh-1", name: "Alimentacao", kind: "expense" });
    expect(calls[0].url).toContain("/categories/find-or-create");
  });

  test("createExpense() calls POST /records/expense", async () => {
    const { client, calls } = createTrackedClient();
    await client.createExpense({ householdId: "hh-1", amountCents: 5000, description: "Almoco", date: "2024-01-15" });
    expect(calls[0].url).toContain("/records/expense");
  });

  test("createIncome() calls POST /records/income", async () => {
    const { client, calls } = createTrackedClient();
    await client.createIncome({ householdId: "hh-1", amountCents: 10000, description: "Salario", date: "2024-01-15" });
    expect(calls[0].url).toContain("/records/income");
  });

  test("createTransfer() calls POST /records/transfer", async () => {
    const { client, calls } = createTrackedClient();
    await client.createTransfer({ householdId: "hh-1", fromAccountId: "acc-1", toAccountId: "acc-2", amountCents: 500, date: "2024-01-15" });
    expect(calls[0].url).toContain("/records/transfer");
  });

  test("getRecords() calls GET /records", async () => {
    const { client, calls } = createTrackedClient();
    await client.getRecords({ householdId: "hh-1", type: "expense" }).catch(() => {});
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].url).toContain("/records");
  });

  test("updateRecord() calls PATCH /records/:id", async () => {
    const { client, calls } = createTrackedClient();
    await client.updateRecord("rec-123", { description: "Updated" });
    expect(calls[0].url).toContain("/records/rec-123");
    expect(calls[0].init.method).toBe("PATCH");
  });

  test("deleteRecord() calls DELETE /records/:id", async () => {
    const { client, calls } = createTrackedClient();
    await client.deleteRecord("rec-123", { householdId: "hh-1" });
    expect(calls[0].url).toContain("/records/rec-123");
    expect(calls[0].init.method).toBe("DELETE");
  });

  test("undoRecord() calls POST /records/:id/undo", async () => {
    const { client, calls } = createTrackedClient();
    await client.undoRecord("rec-123", { householdId: "hh-1" });
    expect(calls[0].url).toContain("/records/rec-123/undo");
  });

  test("createCard() calls POST /cards", async () => {
    const { client, calls } = createTrackedClient();
    await client.createCard({ householdId: "hh-1", name: "Nubank", closingDay: 15, dueDay: 22 });
    expect(calls[0].url).toContain("/cards");
  });

  test("createCardPurchase() calls POST /cards/purchase", async () => {
    const { client, calls } = createTrackedClient();
    await client.createCardPurchase({ householdId: "hh-1", cardId: "card-1", amountCents: 5000, description: "Compra", date: "2024-01-15" });
    expect(calls[0].url).toContain("/cards/purchase");
  });

  test("createCardInstallments() calls POST /cards/installments", async () => {
    const { client, calls } = createTrackedClient();
    await client.createCardInstallments({ householdId: "hh-1", cardId: "card-1", amountCents: 9000, description: "TV", firstDate: "2024-01-15", installmentsCount: 3 });
    expect(calls[0].url).toContain("/cards/installments");
  });

  test("closeInvoice() calls POST /invoices/:id/close", async () => {
    const { client, calls } = createTrackedClient();
    await client.closeInvoice({ householdId: "hh-1", invoiceId: "inv-123" });
    expect(calls[0].url).toContain("/invoices/inv-123/close");
  });

  test("payInvoice() calls POST /invoices/:id/pay", async () => {
    const { client, calls } = createTrackedClient();
    await client.payInvoice({ householdId: "hh-1", invoiceId: "inv-123", paymentAccountId: "acc-1", amountCents: 15000, paymentDate: "2024-02-10" });
    expect(calls[0].url).toContain("/invoices/inv-123/pay");
  });

  test("listCards() calls GET /cards", async () => {
    const { client, calls } = createTrackedClient();
    await client.listCards("hh-1");
    expect(calls[0].url).toContain("/cards");
  });

  test("listInvoices() calls GET /invoices", async () => {
    const { client, calls } = createTrackedClient();
    await client.listInvoices("hh-1", "card-1");
    expect(calls[0].url).toContain("/invoices");
  });

  test("createRecurrence() calls POST /recurrences", async () => {
    const { client, calls } = createTrackedClient();
    await client.createRecurrence({ householdId: "hh-1", description: "Netflix", amountCents: 4990, period: "monthly", targetType: "card_charge", firstDate: "2024-02-01", cardId: "card-1" });
    expect(calls[0].url).toContain("/recurrences");
  });

  test("maintainRecurrenceHorizon() calls POST /recurrences/:id/maintain-horizon", async () => {
    const { client, calls } = createTrackedClient();
    await client.maintainRecurrenceHorizon("rec-123");
    expect(calls[0].url).toContain("/recurrences/rec-123/maintain-horizon");
  });

  test("requestCode() calls POST /auth/request-code", async () => {
    const { client, calls } = createTrackedClient();
    await client.requestCode("+5511999999999");
    expect(calls[0].url).toContain("/auth/request-code");
  });

  test("verifyCode() calls POST /auth/verify-code", async () => {
    const { client, calls } = createTrackedClient();
    await client.verifyCode("+5511999999999", "123456");
    expect(calls[0].url).toContain("/auth/verify-code");
  });

  test("seed() calls POST /auth/seed", async () => {
    const { client, calls } = createTrackedClient();
    await client.seed("Minha Casa", "Joao", "+5511999999999");
    expect(calls[0].url).toContain("/auth/seed");
  });

  test("revoke() calls POST /auth/revoke", async () => {
    const { client, calls } = createTrackedClient();
    await client.revoke();
    expect(calls[0].url).toContain("/auth/revoke");
  });

  test("listReviewItems() calls GET /review", async () => {
    const { client, calls } = createTrackedClient();
    await client.listReviewItems("hh-1", "pending");
    expect(calls[0].url).toContain("/review");
  });

  test("getReviewCount() calls GET /review/count", async () => {
    const { client, calls } = createTrackedClient();
    await client.getReviewCount("hh-1");
    expect(calls[0].url).toContain("/review/count");
  });

  test("approveReview() calls POST /review/:id/approve", async () => {
    const { client, calls } = createTrackedClient();
    await client.approveReview("entry-123", "user-1");
    expect(calls[0].url).toContain("/review/entry-123/approve");
  });

  test("rejectReview() calls POST /review/:id/reject", async () => {
    const { client, calls } = createTrackedClient();
    await client.rejectReview("entry-123", "user-1", true);
    expect(calls[0].url).toContain("/review/entry-123/reject");
  });

  test("createLoan() calls POST /loans", async () => {
    const { client, calls } = createTrackedClient();
    await client.createLoan({ householdId: "hh-1", description: "Emprestimo", principalCents: 100000, interestRateBps: 1500, startDate: "2024-01-01", dueDay: 10, totalInstallments: 12 });
    expect(calls[0].url).toContain("/loans");
  });

  test("listLoans() calls GET /loans", async () => {
    const { client, calls } = createTrackedClient();
    await client.listLoans("hh-1");
    expect(calls[0].url).toContain("/loans");
  });

  test("payLoanInstallment() calls POST /loans/:id/pay-installment", async () => {
    const { client, calls } = createTrackedClient();
    await client.payLoanInstallment("loan-123", "hh-1");
    expect(calls[0].url).toContain("/loans/loan-123/pay-installment");
  });

  test("createBudget() calls POST /budgets", async () => {
    const { client, calls } = createTrackedClient();
    await client.createBudget({ householdId: "hh-1", categoryId: "cat-1", monthlyLimitCents: 50000, periodMonth: "2024-01" });
    expect(calls[0].url).toContain("/budgets");
  });

  test("listBudgets() calls GET /budgets", async () => {
    const { client, calls } = createTrackedClient();
    await client.listBudgets("hh-1");
    expect(calls[0].url).toContain("/budgets");
  });

  test("getCurrentMonthSummary() calls GET /reports/current-month", async () => {
    const { client, calls } = createTrackedClient();
    await client.getCurrentMonthSummary("hh-1");
    expect(calls[0].url).toContain("/reports/current-month");
  });

  test("getCategoryBreakdown() calls GET /reports/category-breakdown", async () => {
    const { client, calls } = createTrackedClient();
    await client.getCategoryBreakdown("hh-1", "2024-01-01", "2024-01-31", "expense");
    expect(calls[0].url).toContain("/reports/category-breakdown");
  });

  test("getAccountBalances() calls GET /reports/account-balances", async () => {
    const { client, calls } = createTrackedClient();
    await client.getAccountBalances("hh-1");
    expect(calls[0].url).toContain("/reports/account-balances");
  });

  test("getBudgetVsActual() calls GET /reports/budget-vs-actual", async () => {
    const { client, calls } = createTrackedClient();
    await client.getBudgetVsActual("hh-1");
    expect(calls[0].url).toContain("/reports/budget-vs-actual");
  });

  test("getInvoicesDue() calls GET /reports/invoices-due", async () => {
    const { client, calls } = createTrackedClient();
    await client.getInvoicesDue("hh-1");
    expect(calls[0].url).toContain("/reports/invoices-due");
  });

  test("createAttachment() calls POST /attachments", async () => {
    const { client, calls } = createTrackedClient();
    await client.createAttachment({ householdId: "hh-1", entityType: "record", entityId: "rec-1", filename: "receipt.jpg", mimeType: "image/jpeg", data: "base64data" });
    expect(calls[0].url).toContain("/attachments");
  });

  test("getAttachments() calls GET /attachments", async () => {
    const { client, calls } = createTrackedClient();
    await client.getAttachments("hh-1", "record", "rec-1");
    expect(calls[0].url).toContain("/attachments");
  });

  test("deleteAttachment() calls DELETE /attachments/:id", async () => {
    const { client, calls } = createTrackedClient();
    await client.deleteAttachment("att-123", "hh-1");
    expect(calls[0].url).toContain("/attachments/att-123");
  });

  test("createReimbursement() calls POST /reimbursements", async () => {
    const { client, calls } = createTrackedClient();
    await client.createReimbursement({ householdId: "hh-1", recordId: "rec-1", amountCents: 5000, description: "Reembolso" });
    expect(calls[0].url).toContain("/reimbursements");
  });

  test("getReimbursements() calls GET /reimbursements", async () => {
    const { client, calls } = createTrackedClient();
    await client.getReimbursements("hh-1");
    expect(calls[0].url).toContain("/reimbursements");
  });

  test("completeReimbursement() calls POST /reimbursements/:id/complete", async () => {
    const { client, calls } = createTrackedClient();
    await client.completeReimbursement("reim-123", "hh-1", "acc-1", "2024-01-20");
    expect(calls[0].url).toContain("/reimbursements/reim-123/complete");
  });

  test("splitExpense() calls POST /records/:id/split", async () => {
    const { client, calls } = createTrackedClient();
    await client.splitExpense("rec-123", "hh-1", [{ userId: "user-1", amountCents: 6000 }, { userId: "user-2", amountCents: 4000 }]);
    expect(calls[0].url).toContain("/records/rec-123/split");
  });

  test("client has all required methods", async () => {
    const { client } = createTrackedClient();
    const methods = ["health", "listAccounts", "createAccount", "listCategories", "findOrCreateCategory", "createExpense", "createIncome", "createTransfer", "getRecords", "updateRecord", "deleteRecord", "undoRecord", "createCard", "createCardPurchase", "createCardInstallments", "closeInvoice", "payInvoice", "listCards", "listInvoices", "createRecurrence", "maintainRecurrenceHorizon", "requestCode", "verifyCode", "seed", "revoke", "listReviewItems", "getReviewCount", "approveReview", "rejectReview", "createLoan", "listLoans", "payLoanInstallment", "createBudget", "listBudgets", "getCurrentMonthSummary", "getCategoryBreakdown", "getAccountBalances", "getBudgetVsActual", "getInvoicesDue", "createAttachment", "getAttachments", "deleteAttachment", "createReimbursement", "getReimbursements", "completeReimbursement", "splitExpense"];
    for (const method of methods) { expect(typeof client[method]).toBe("function"); }
  });
});