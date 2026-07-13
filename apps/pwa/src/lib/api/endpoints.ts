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
  StatementPurchase,
  Profile,
  QuickInsight,
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

export async function updateCardPurchase(
  purchaseId: string,
  input: {
    description?: string;
    amountCents?: number;
    date?: string;
    categoryId?: string;
  },
): Promise<StatementDetail> {
  return apiFetch<StatementDetail>(`/cards/purchases/${purchaseId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
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

export async function updateSubscription(
  id: string,
  input: {
    name?: string;
    amountCents?: number;
    cycle?: "monthly" | "yearly" | "weekly";
    day?: number;
    paymentMethod?: string;
  },
): Promise<Subscription> {
  return apiFetch<Subscription>(`/subscriptions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
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

export async function updateTransaction(
  id: string,
  input: {
    description?: string;
    date?: string;
    amountCents?: number;
    accountId?: string;
    categoryId?: string;
  },
): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteTransaction(id: string): Promise<void> {
  await apiFetch(`/transactions/${id}`, { method: "DELETE" });
}

export async function updateAccount(
  id: string,
  input: { name: string },
): Promise<Account> {
  return apiFetch<Account>(`/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deactivateAccount(id: string): Promise<void> {
  await apiFetch(`/accounts/${id}/deactivate`, { method: "POST" });
}

export async function updateCategory(
  id: string,
  input: { name: string },
): Promise<Category> {
  return apiFetch<Category>(`/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deactivateCategory(id: string): Promise<void> {
  await apiFetch(`/categories/${id}/deactivate`, { method: "POST" });
}

export async function createPayable(input: {
  accountId: string;
  description: string;
  amountCents: number;
  dueDate: string;
  categoryId?: string;
  type?: "one_time" | "recurring";
  frequency?: "monthly" | "quarterly" | "yearly";
  reminderDaysBefore?: number;
  notes?: string;
}): Promise<Payable> {
  return apiFetch<Payable>("/payables", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelPayable(
  id: string,
  reason?: string
): Promise<Payable> {
  return apiFetch<Payable>(`/payables/${id}/cancel`, {
    method: "POST",
    body: reason ? JSON.stringify({ reason }) : undefined,
  });
}

export async function updatePayable(
  id: string,
  input: {
    description?: string;
    amountCents?: number;
    dueDate?: string;
    accountId?: string;
    categoryId?: string;
  },
): Promise<Payable> {
  return apiFetch<Payable>(`/payables/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function undoPayablePayment(id: string): Promise<Payable> {
  return apiFetch<Payable>(`/payables/${id}/unpay`, {
    method: "POST",
  });
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

export async function createBudget(input: {
  categoryId: string;
  name: string;
  amountCents: number;
  period: "monthly" | "quarterly" | "yearly";
  startDate: string;
  alertThreshold?: number;
}): Promise<Budget> {
  return apiFetch<Budget>("/budgets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBudget(
  id: string,
  input: {
    amountCents?: number;
    alertThreshold?: number;
  },
): Promise<Budget> {
  return apiFetch<Budget>(`/budgets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createGoal(input: {
  name: string;
  goalType: "savings" | "purchase" | "debt_payoff" | "emergency_fund";
  targetAmountCents: number;
  startDate: string;
  targetDate?: string;
  description?: string;
  categoryId?: string;
  accountId?: string;
}): Promise<Goal> {
  return apiFetch<Goal>("/goals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function contributeToGoal(
  id: string,
  input: {
    amountCents: number;
    contributionDate?: string;
    source?: string;
    notes?: string;
  },
): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${id}/contribute`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelGoal(id: string): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${id}/cancel`, { method: "POST" });
}

export async function updateGoal(
  id: string,
  input: {
    name?: string;
    targetAmountCents?: number;
    targetDate?: string;
  },
): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

// ─── Profile (Slice B / Resumo) ──────────────────────────

export async function fetchProfile(): Promise<Profile | null> {
  const res = await apiFetch<{ profile: Profile | null }>("/profile");
  return res.profile;
}

export async function patchProfile(input: {
  name?: string;
  email?: string;
  phone?: string;
  avatarColor?: string;
  greetingStyle?: Profile["greetingStyle"];
}): Promise<Profile> {
  const res = await apiFetch<{ profile: Profile }>("/profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  return res.profile;
}

export async function fetchQuickInsights(): Promise<QuickInsight[]> {
  const res = await apiFetch<{ items: QuickInsight[] }>("/insights/quick");
  return res.items;
}

