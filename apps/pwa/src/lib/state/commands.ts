/**
 * Command boundary — isolates the write side of the AppState provider.
 *
 * Every UI mutation (create/update/delete/pay) is wrapped by `createCommands`,
 * which enforces the offline invariant: when `online === false`, a command
 * throws `OfflineWriteError` immediately — zero network request and zero
 * optimistic state mutation. When `online === true`, the command delegates
 * to the `api` (endpoints module) and dispatches `CLEAR_WRITE_ERROR` on
 * success so a stale prior write error does not linger.
 *
 * The factory preserves the original endpoint signatures verbatim
 * ("preserve idempotency argument unchanged") so call-sites can swap the
 * provider's inline `endpoints.x(...)` for `commands.x(...)` with no
 * argument-shape changes.
 */
import type { AppStateAction } from "./state-reducer";
import type {
  Account, Budget, Category, Goal, Payable, Subscription, Transaction,
} from "./types";
import * as endpoints from "@/lib/api/endpoints";

/**
 * Thrown by every command when the session cannot reach the API.
 * Carries no payload — callers match by `instanceof` (or `name`)
 * to distinguish offline from network/server errors.
 */
export class OfflineWriteError extends Error {
  constructor(methodName: string) {
    super(`${methodName} blocked: offline (no API or no token)`);
    this.name = "OfflineWriteError";
  }
}

export interface CommandsContext {
  /** Whether writes are currently permitted (API configured + token present). */
  online: boolean;
  /** Auth token captured at command-creation time; null/undefined when offline. */
  token: string | undefined;
  /** Reducer dispatch (used to clear stale write errors on success). */
  dispatch: (action: AppStateAction) => void;
  /** Endpoints module — the real network side. */
  api: typeof endpoints;
}

export interface TransactionCreateInput {
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  accountId: string;
}

export interface TransactionUpdateInput {
  description?: string;
  date?: string;
  amountCents?: number;
  accountId?: string;
  categoryId?: string;
}

export interface TransferInput {
  description: string;
  amountCents: number;
  date: string;
  fromAccountId: string;
  toAccountId: string;
}

export interface PayableInput {
  accountId: string;
  description: string;
  amountCents: number;
  dueDate: string;
  categoryId?: string;
}

export interface PayableUpdateInput {
  description?: string;
  amountCents?: number;
  dueDate?: string;
  accountId?: string;
  categoryId?: string;
}

export interface BudgetInput {
  categoryId: string;
  name: string;
  amountCents: number;
  period: "monthly" | "quarterly" | "yearly";
  startDate: string;
}

export interface BudgetUpdateInput {
  amountCents?: number;
  alertThreshold?: number;
}

export interface GoalInput {
  name: string;
  goalType: "savings" | "purchase" | "debt_payoff" | "emergency_fund";
  targetAmountCents: number;
  startDate: string;
}

export interface GoalUpdateInput {
  name?: string;
  targetAmountCents?: number;
  targetDate?: string;
}

export interface AccountInput {
  name: string;
  kind: "bank" | "cash" | "credit_card";
  initialBalanceCents: number;
}

export interface CategoryInput {
  name: string;
  kind: "expense" | "income";
  parentId?: string;
}

export interface CardInput {
  name: string;
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
}

export interface CardUpdateInput {
  name?: string;
  creditLimitCents?: number;
  closingDay?: number;
  dueDay?: number;
}

export interface SubscriptionInput {
  name: string;
  amountCents: number;
  cycle: "monthly" | "yearly" | "weekly";
  day: number;
  paymentMethod: string;
}

export interface SubscriptionUpdateInput {
  name?: string;
  amountCents?: number;
  cycle?: "monthly" | "yearly" | "weekly";
  day?: number;
  paymentMethod?: string;
}

export interface PayStatementInput {
  amountCents: number;
  fromAccountId: string;
}

export interface InstallmentsInput {
  accountId: string;
  description: string;
  totalAmountCents: number;
  purchaseDate: string;
  installmentsTotal: number;
  categoryId?: string;
}

export interface ProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  avatarColor?: string;
  greetingStyle?: "auto" | "minimal" | "verbose";
}

/**
 * The full command surface. The provider exposes a subset via the AppState
 * facade; this object is the canonical write seam.
 */
export interface Commands {
  // ── Transactions (create / update / delete / transfer) ─────────
  createExpenseTransaction(input: TransactionCreateInput): Promise<Transaction>;
  createIncomeTransaction(input: TransactionCreateInput): Promise<Transaction>;
  updateTransaction(id: string, input: TransactionUpdateInput): Promise<Transaction>;
  deleteTransaction(id: string): Promise<void>;
  createTransfer(input: TransferInput): Promise<Transaction>;

  // ── Accounts (create / update / deactivate) ────────────────────
  addAccount(input: AccountInput): Promise<Account>;
  updateAccount(id: string, input: { name: string }): Promise<Account>;
  deactivateAccount(id: string): Promise<void>;

  // ── Categories (create / update / deactivate) ──────────────────
  addCategory(input: CategoryInput): Promise<Category>;
  updateCategory(id: string, input: { name: string }): Promise<Category>;
  deactivateCategory(id: string): Promise<void>;

  // ── Cards (credit) ─────────────────────────────────────────────
  createCard(input: CardInput): Promise<Account>;
  updateCard(id: string, input: CardUpdateInput): Promise<Account>;

  // ── Payables (create / markPaid / undo / cancel / update) ──────
  createPayable(input: PayableInput): Promise<Payable>;
  markPayablePaid(id: string, paidDate: string): Promise<Payable>;
  undoPayablePayment(id: string): Promise<Payable>;
  cancelPayable(id: string): Promise<Payable>;
  updatePayable(id: string, input: PayableUpdateInput): Promise<Payable>;

  // ── Budgets (create / update) ──────────────────────────────────
  createBudget(input: BudgetInput): Promise<Budget>;
  updateBudget(id: string, input: BudgetUpdateInput): Promise<Budget>;

  // ── Goals (create / contribute / cancel / update) ──────────────
  createGoal(input: GoalInput): Promise<Goal>;
  contributeToGoal(id: string, input: { amountCents: number }): Promise<Goal>;
  cancelGoal(id: string): Promise<Goal>;
  updateGoal(id: string, input: GoalUpdateInput): Promise<Goal>;

  // ── Subscriptions (create / cancel / update) ───────────────────
  addSubscription(input: SubscriptionInput): Promise<Subscription>;
  cancelSubscription(id: string): Promise<Subscription>;
  updateSubscription(id: string, input: SubscriptionUpdateInput): Promise<Subscription>;

  // ── Statements / Installments ──────────────────────────────────
  payStatement(statementId: string, input: PayStatementInput): Promise<unknown>;
  createInstallments(input: InstallmentsInput): Promise<unknown>;

  // ── Profile patch ──────────────────────────────────────────────
  patchProfile(input: ProfileInput): Promise<unknown>;
}

/**
 * Wrap a network call so it short-circuits to `OfflineWriteError` when the
 * session is offline, and clears any stale write error on success.
 */
function guarded<T>(
  methodName: string,
  ctx: CommandsContext,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ctx.online) return Promise.reject(new OfflineWriteError(methodName));
  return fn().then((value) => {
    ctx.dispatch({ type: "CLEAR_WRITE_ERROR" });
    return value;
  });
}

/**
 * Build the full command surface bound to the given context (online/token/
 * dispatch/api). The returned object is the canonical seam for all UI writes;
 * the provider composes it with optimistic React-state mutation and rollback.
 */
export function createCommands(ctx: CommandsContext): Commands {
  const a = ctx.api;
  return {
    // ── Transactions ─────────────────────────────────────────────
    createExpenseTransaction(input) {
      return guarded("createExpenseTransaction", ctx, () =>
        a.createExpenseTransaction(input),
      );
    },
    createIncomeTransaction(input) {
      return guarded("createIncomeTransaction", ctx, () =>
        a.createIncomeTransaction(input),
      );
    },
    updateTransaction(id, input) {
      return guarded("updateTransaction", ctx, () =>
        a.updateTransaction(id, input),
      );
    },
    deleteTransaction(id) {
      return guarded("deleteTransaction", ctx, () => a.deleteTransaction(id));
    },
    createTransfer(input) {
      return guarded("createTransfer", ctx, () => a.createTransfer(input));
    },

    // ── Accounts ─────────────────────────────────────────────────
    addAccount(input) {
      return guarded("addAccount", ctx, () => a.addAccount(input));
    },
    updateAccount(id, input) {
      return guarded("updateAccount", ctx, () => a.updateAccount(id, input));
    },
    deactivateAccount(id) {
      return guarded("deactivateAccount", ctx, () => a.deactivateAccount(id));
    },

    // ── Categories ───────────────────────────────────────────────
    addCategory(input) {
      return guarded("addCategory", ctx, () => a.addCategory(input));
    },
    updateCategory(id, input) {
      return guarded("updateCategory", ctx, () => a.updateCategory(id, input));
    },
    deactivateCategory(id) {
      return guarded("deactivateCategory", ctx, () => a.deactivateCategory(id));
    },

    // ── Cards ────────────────────────────────────────────────────
    createCard(input) {
      return guarded("createCard", ctx, () => a.createCard(input));
    },
    updateCard(id, input) {
      return guarded("updateCard", ctx, () => a.updateCard(id, input));
    },

    // ── Payables ─────────────────────────────────────────────────
    createPayable(input) {
      return guarded("createPayable", ctx, () => a.createPayable(input));
    },
    markPayablePaid(id, paidDate) {
      return guarded("markPayablePaid", ctx, () =>
        a.markPayablePaid(id, paidDate),
      );
    },
    undoPayablePayment(id) {
      return guarded("undoPayablePayment", ctx, () =>
        a.undoPayablePayment(id),
      );
    },
    cancelPayable(id) {
      return guarded("cancelPayable", ctx, () => a.cancelPayable(id));
    },
    updatePayable(id, input) {
      return guarded("updatePayable", ctx, () => a.updatePayable(id, input));
    },

    // ── Budgets ──────────────────────────────────────────────────
    createBudget(input) {
      return guarded("createBudget", ctx, () => a.createBudget(input));
    },
    updateBudget(id, input) {
      return guarded("updateBudget", ctx, () => a.updateBudget(id, input));
    },

    // ── Goals ────────────────────────────────────────────────────
    createGoal(input) {
      return guarded("createGoal", ctx, () => a.createGoal(input));
    },
    contributeToGoal(id, input) {
      return guarded("contributeToGoal", ctx, () =>
        a.contributeToGoal(id, input),
      );
    },
    cancelGoal(id) {
      return guarded("cancelGoal", ctx, () => a.cancelGoal(id));
    },
    updateGoal(id, input) {
      return guarded("updateGoal", ctx, () => a.updateGoal(id, input));
    },

    // ── Subscriptions ────────────────────────────────────────────
    addSubscription(input) {
      return guarded("addSubscription", ctx, () => a.addSubscription(input));
    },
    cancelSubscription(id) {
      return guarded("cancelSubscription", ctx, () => a.cancelSubscription(id));
    },
    updateSubscription(id, input) {
      return guarded("updateSubscription", ctx, () =>
        a.updateSubscription(id, input),
      );
    },

    // ── Statements / Installments ───────────────────────────────
    payStatement(statementId, input) {
      return guarded("payStatement", ctx, () =>
        a.payStatement(statementId, input),
      );
    },
    createInstallments(input) {
      return guarded("createInstallments", ctx, () =>
        a.createInstallments(input),
      );
    },

    // ── Profile ──────────────────────────────────────────────────
    patchProfile(input) {
      return guarded("patchProfile", ctx, () => a.patchProfile(input));
    },
  };
}
