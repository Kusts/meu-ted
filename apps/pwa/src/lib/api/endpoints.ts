/**
 * Typed API endpoints for pi-finance-api.
 * Each function calls apiFetch and maps the response to client types.
 * Throws when API is not configured (caller falls back to mock).
 */

import type {
  Account,
  Category,
  Transaction,
  Payable,
  Budget,
  Goal,
  Subscription,
  CardStatement,
  StatementDetail,
} from "@/lib/state/types";
import { apiFetch } from "./client";

// ─── Response shapes (from Fastify routes) ───────────────────────────────────

interface ListResponse<T> {
  items: T[];
  total: number;
  limit?: number;
  offset?: number;
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export async function fetchAccounts(): Promise<Account[]> {
  const res = await apiFetch<ListResponse<Account>>("/accounts");
  return res.items;
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiFetch<ListResponse<Category>>("/categories");
  return res.items;
}

export async function fetchTransactions(
  params?: { limit?: number; offset?: number; kind?: string }
): Promise<{ items: Transaction[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  if (params?.kind) q.set("kind", params.kind);
  const qs = q.toString();
  return apiFetch(`/transactions${qs ? `?${qs}` : ""}`);
}

export async function fetchPayables(params?: {
  status?: string;
}): Promise<Payable[]> {
  const q = params?.status ? `?status=${params.status}` : "";
  const res = await apiFetch<ListResponse<Payable>>(`/payables${q}`);
  return res.items;
}

export async function fetchBudgets(): Promise<Budget[]> {
  const res = await apiFetch<ListResponse<Budget>>("/budgets");
  return res.items;
}

export async function fetchGoals(): Promise<Goal[]> {
  const res = await apiFetch<ListResponse<Goal>>("/goals");
  return res.items;
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function createExpenseTransaction(input: {
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  accountId: string;
  method?: string;
  sourceMessageId?: string;
}): Promise<Transaction> {
  return apiFetch<Transaction>("/transactions/expense", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createCard(input: {
  name: string;
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
}): Promise<Account> {
  return apiFetch<Account>("/cards", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCard(
  id: string,
  input: {
    name?: string;
    creditLimitCents?: number;
    closingDay?: number;
    dueDay?: number;
  },
): Promise<Account> {
  return apiFetch<Account>(`/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchCards(): Promise<Account[]> {
  const res = await apiFetch<ListResponse<Account>>("/cards/accounts");
  return res.items;
}

export async function fetchStatements(accountId?: string): Promise<CardStatement[]> {
  const q = accountId ? `?accountId=${accountId}` : "";
  const res = await apiFetch<ListResponse<CardStatement>>(`/cards/statements${q}`);
  return res.items;
}

export async function fetchStatementDetail(id: string): Promise<StatementDetail> {
  return apiFetch<StatementDetail>(`/cards/statements/${id}`);
}

export async function payStatement(
  statementId: string,
  input: { amountCents: number; fromAccountId: string },
): Promise<CardStatement> {
  return apiFetch<CardStatement>(`/cards/statements/${statementId}/pay`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createInstallments(input: {
  accountId: string;
  description: string;
  totalAmountCents: number;
  purchaseDate: string;
  installmentsTotal: number;
  categoryId?: string;
}): Promise<Transaction[]> {
  const res = await apiFetch<{ items: Transaction[] }>("/cards/installments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return res.items;
}

export async function createTransfer(input: {
  description: string;
  amountCents: number;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  method?: string;
}): Promise<Transaction> {
  return apiFetch<Transaction>("/transfers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function addAccount(input: {
  name: string;
  kind: "bank" | "cash" | "credit_card";
  initialBalanceCents: number;
}): Promise<Account> {
  return apiFetch<Account>("/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function addCategory(input: {
  name: string;
  kind: "expense" | "income";
  parentId?: string;
}): Promise<Category> {
  return apiFetch<Category>("/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchSubscriptions(): Promise<Subscription[]> {
  const res = await apiFetch<ListResponse<Subscription>>("/subscriptions");
  return res.items;
}

export async function addSubscription(input: {
  name: string;
  amountCents: number;
  cycle: "monthly" | "yearly" | "weekly";
  day: number;
  paymentMethod: string;
}): Promise<Subscription> {
  return apiFetch<Subscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelSubscription(id: string): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}/cancel`, {
    method: "POST",
  });
}

export async function createIncomeTransaction(input: {
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  accountId: string;
  method?: string;
  sourceMessageId?: string;
}): Promise<Transaction> {
  return apiFetch<Transaction>("/transactions/income", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiFetch(`/transactions/${id}`, { method: "DELETE" });
}

export async function markPayablePaid(
  id: string,
  paidDate?: string
): Promise<Payable> {
  const body = paidDate ? { paidDate } : {};
  return apiFetch<Payable>(`/payables/${id}/pay`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
