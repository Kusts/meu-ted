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
  Profile,
  QuickInsight,
  DashboardSummary,
  PendingOperation,
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
  params?: { limit?: number; offset?: number; page?: number; kind?: string }
): Promise<{ items: Transaction[]; total: number; limit?: number; offset?: number; page?: number }> {
  const q = new URLSearchParams();
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset !== undefined) {
    q.set("offset", String(params.offset));
  } else if (params?.page !== undefined) {
    const limit = params.limit ?? 50;
    q.set("offset", String((params.page - 1) * limit));
    q.set("page", String(params.page));
  }
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

// ─── Pending Operations ───────────────────────────────────────────

export async function fetchPendingOperations(
  status: PendingOperation["status"] = "pending",
): Promise<PendingOperation[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await apiFetch<{ items: PendingOperation[]; total: number }>(`/pending-operations${qs}`);
  return res.items;
}

export async function approvePendingOperation(id: string): Promise<PendingOperation> {
  return apiFetch<PendingOperation>(`/pending-operations/${encodeURIComponent(id)}/approve`, {
    method: "POST",
  });
}

export async function rejectPendingOperation(id: string): Promise<PendingOperation> {
  return apiFetch<PendingOperation>(`/pending-operations/${encodeURIComponent(id)}/reject`, {
    method: "POST",
  });
}

export async function undoLastAction(input?: { lastOperationId?: string }): Promise<{
  undone: { operation: string; entityId: string; reversal: string };
}> {
  return apiFetch<{ undone: { operation: string; entityId: string; reversal: string } }>('/audit/undo', {
    method: 'POST',
    body: JSON.stringify(input ?? {}),
    idempotencyKey: crypto.randomUUID(),
  });
}

// ─── Duplicate detector ─────────────────────────────────────

export type DuplicateCheckInput = {
  kind: "expense" | "income" | "transfer";
  description: string;
  amountCents: number;
  date: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  idempotencyKey?: string;
};

export type DuplicateMatch = {
  id: string;
  description: string;
  amount_cents: string;
  date: string;
  match_type: "idempotency_key" | "semantic";
  similarity: number;
};

export type DuplicateCheckResult = {
  duplicate_detected: boolean;
  match?: DuplicateMatch;
};

export function formatDuplicateWarning(match: DuplicateMatch, newDesc: string): string {
  const dateStr = new Date(match.date).toISOString().slice(0, 10);
  const amount = (parseInt(match.amount_cents, 10) / 100).toFixed(2);
  const simPct = Math.round(match.similarity * 100);
  if (match.match_type === "idempotency_key") {
    return `Já existe um lançamento com essa chave de idempotência: ${match.description} — R$ ${amount} em ${dateStr} ID: ${match.id} Quer registrar mesmo assim?`;
  }
  return `Achei um lançamento parecido: "${match.description}" — R$ ${amount} em ${dateStr} (${simPct}% similar) Seu novo: "${newDesc}" É o mesmo gasto?`;
}

export async function checkDuplicate(input: DuplicateCheckInput): Promise<DuplicateCheckResult> {
  return apiFetch<DuplicateCheckResult>("/transactions/detect-duplicate", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─── Audit logs ───────────────────────────────────────────

export type AuditLog = {
  id: string;
  workspaceId: string;
  actorType: "device" | "user";
  actorId: string;
  operation: string;
  eventType: string;
  payloadHash: string;
  effectRef?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuditLogFilters = {
  limit?: number;
  operation?: string;
  eventType?: string;
  actorType?: "device" | "user";
  entityType?: string;
  entityId?: string;
};

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<{ items: AuditLog[]; total: number }> {
  const q = new URLSearchParams();
  if (filters.limit !== undefined) q.set("limit", String(filters.limit));
  if (filters.operation) q.set("operation", filters.operation);
  if (filters.eventType) q.set("eventType", filters.eventType);
  if (filters.actorType) q.set("actorType", filters.actorType);
  if (filters.entityType) q.set("entityType", filters.entityType);
  if (filters.entityId) q.set("entityId", filters.entityId);
  const qs = q.toString();
  return apiFetch(`/audit-logs${qs ? `?${qs}` : ""}`);
}

// ─── Dashboard Summary ───────────────────────────────────

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/dashboard/summary");
}

// ─── Price Alerts ────────────────────────────────────────────

export type PriceAlert = {
  id: string;
  householdId: string;
  productName: string;
  targetPriceCents: number;
  condition: "below" | "above";
  createdAt: string;
};

export async function fetchPriceAlerts(): Promise<PriceAlert[]> {
  const res = await apiFetch<{ items: PriceAlert[]; total: number }>("/alerts/price");
  return res.items;
}

export async function createPriceAlert(input: {
  productName: string;
  targetPriceCents: number;
  condition: "below" | "above";
}): Promise<PriceAlert> {
  return apiFetch<PriceAlert>("/alerts/price", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function checkPriceAlertsApi(input?: {
  productName?: string;
  currentPriceCents?: number;
}): Promise<{ notifications: { alertId: string; productName: string; triggered: boolean; message: string }[]; total: number }> {
  return apiFetch("/alerts/price/check", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

