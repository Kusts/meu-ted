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
  Account, Budget, Category, Goal, Payable, Subscription, Transaction, CardStatement,
} from "./types";
import type { ReceiptCarryingItems, DeletedTransaction } from "@/lib/api/endpoints";
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
  /** Optional dirty-track callback: call before write, run its return on success. */
  trackWrite?: () => () => void;
}

export interface TransactionCreateInput {
  description: string;
  amountCents: number;
  date: string;
  categoryId: string;
  accountId: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface TransactionUpdateInput {
  description?: string;
  date?: string;
  amountCents?: number;
  accountId?: string;
  categoryId?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface TransferInput {
  description: string;
  amountCents: number;
  date: string;
  fromAccountId: string;
  toAccountId: string;
  idempotencyKey?: string;
}

export interface PayableInput {
  accountId: string;
  description: string;
  amountCents: number;
  dueDate: string;
  categoryId?: string;
  idempotencyKey?: string;
}

export interface PayableUpdateInput {
  description?: string;
  amountCents?: number;
  dueDate?: string;
  accountId?: string;
  categoryId?: string;
  idempotencyKey?: string;
}

export interface BudgetInput {
  categoryId: string;
  name: string;
  amountCents: number;
  period: "monthly" | "quarterly" | "yearly";
  startDate: string;
  idempotencyKey?: string;
}

export interface BudgetUpdateInput {
  amountCents?: number;
  alertThreshold?: number;
  idempotencyKey?: string;
}

export interface GoalInput {
  name: string;
  goalType: "savings" | "purchase" | "debt_payoff" | "emergency_fund";
  targetAmountCents: number;
  startDate: string;
  idempotencyKey?: string;
}

export interface GoalUpdateInput {
  name?: string;
  targetAmountCents?: number;
  targetDate?: string;
  idempotencyKey?: string;
}

export interface AccountInput {
  name: string;
  kind: "bank" | "cash" | "credit_card";
  initialBalanceCents: number;
  idempotencyKey?: string;
}

export interface CategoryInput {
  name: string;
  kind: "expense" | "income";
  parentId?: string;
  icon?: string | null;
  color?: string | null;
  idempotencyKey?: string;
}

export interface CategoryUpdateInput {
  name?: string;
  icon?: string | null;
  color?: string | null;
}

export type CategoryDeleteInput =
  | { mode: "move"; destinationCategoryId: string }
  | { mode: "cascade"; confirm: true };

export interface CategoryDeleteResult {
  ok: boolean;
  deletedCategoryIds: string[];
  movedTransactions: number;
  softDeletedTransactions: number;
}

export interface CategoryDefaultsResult {
  ok: boolean;
  created: number;
  skipped: number;
}

export interface CardInput {
  name: string;
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
  idempotencyKey?: string;
}

export interface CardUpdateInput {
  name?: string;
  creditLimitCents?: number;
  closingDay?: number;
  dueDay?: number;
  idempotencyKey?: string;
}

export interface SubscriptionInput {
  name: string;
  amountCents: number;
  cycle: "monthly" | "yearly" | "weekly";
  day: number;
  paymentMethod: string;
  idempotencyKey?: string;
}

export interface SubscriptionUpdateInput {
  name?: string;
  amountCents?: number;
  cycle?: "monthly" | "yearly" | "weekly";
  day?: number;
  paymentMethod?: string;
  idempotencyKey?: string;
}

export interface PayStatementInput {
  amountCents: number;
  fromAccountId: string;
  idempotencyKey?: string;
}

export interface InstallmentsInput {
  accountId: string;
  description: string;
  totalAmountCents: number;
  purchaseDate: string;
  installmentsTotal: number;
  categoryId?: string;
  subcategoryId?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface CardPurchaseInput {
  accountId: string;
  description: string;
  amountCents: number;
  date: string;
  categoryId?: string;
  subcategoryId?: string;
  notes?: string;
  idempotencyKey?: string;
}

export interface ProfileInput {
  name?: string;
  email?: string;
  phone?: string;
  avatarColor?: string;
  greetingStyle?: "auto" | "minimal" | "verbose";
  idempotencyKey?: string;
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
  deleteTransaction(id: string): Promise<DeletedTransaction>;
  createTransfer(input: TransferInput): Promise<Transaction>;

  // ── Accounts (create / update / deactivate) ────────────────────
  addAccount(input: AccountInput): Promise<Account>;
  updateAccount(id: string, input: { name: string }): Promise<Account>;
  deactivateAccount(id: string): Promise<void>;

  // ── Categories (create / update / deactivate) ──────────────────
  addCategory(input: CategoryInput): Promise<Category>;
  updateCategory(id: string, input: CategoryUpdateInput): Promise<Category>;
  deactivateCategory(id: string): Promise<void>;
  deleteCategory(id: string, input: CategoryDeleteInput): Promise<CategoryDeleteResult>;
  applyCategoryDefaults(): Promise<CategoryDefaultsResult>;

  // ── Cards (credit) ─────────────────────────────────────────────
  createCard(input: CardInput): Promise<Account>;
  updateCard(id: string, input: CardUpdateInput): Promise<Account>;

  // ── Payables (create / markPaid / undo / cancel / update) ──────
  createPayable(input: PayableInput): Promise<Payable>;
  markPayablePaid(id: string, paidDate: string): Promise<Payable>;
  undoPayablePayment(id: string, paidTransactionId: string): Promise<Payable>;
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
  // FIX-P1: the card-write values carry the server receipt additively
  // (ReceiptCarryingItems) and are returned untouched, so the existing
  // `reconcileAfterWrite` mechanism (extractMutationReceipt → receipt wins,
  // mutationKind fallback) consumes the real receipt with no API change.
  payStatement(statementId: string, input: PayStatementInput): Promise<CardStatement>;
  createInstallments(input: InstallmentsInput): Promise<ReceiptCarryingItems<Transaction>>;
  createCardPurchase(input: CardPurchaseInput): Promise<ReceiptCarryingItems<Transaction>>;

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
  // Track dirty state — cleanup on success, retain on failure
  const cleanup = ctx.trackWrite?.();
  return fn()
    .then((value) => {
      ctx.dispatch({ type: "CLEAR_WRITE_ERROR" });
      cleanup?.();
      return value;
    })
    .catch((e) => {
      // On failure: do NOT cleanup — retain dirty state so the UI knows
      // there's a pending/incomplete write. The user must retry or cancel.
      throw e;
    });
}

/**
 * Build the full command surface bound to the given context (online/token/
 * dispatch/api). The returned object is the canonical seam for all UI writes;
 * the provider composes it with optimistic React-state mutation and rollback.
 *
 * Every command is wrapped with an in-flight double-submit guard: while a
 * mutation is pending, an identical re-invocation (same command + same
 * arguments) reuses the same promise instead of firing a duplicate write.
 */
export function createCommands(ctx: CommandsContext): Commands {
  const inflightWrites = new Map<string, Promise<unknown>>();
  const impl = buildCommands(ctx);
  const wrapped: Record<string, unknown> = {};
  for (const [name, fn] of Object.entries(impl)) {
    wrapped[name] = (...args: unknown[]) => {
      const dedupeKey = `${name}:${JSON.stringify(args)}`;
      const pending = inflightWrites.get(dedupeKey);
      if (pending) return pending;
      const promise = (fn as (...a: unknown[]) => Promise<unknown>)(...args)
        .finally(() => {
          inflightWrites.delete(dedupeKey);
        });
      inflightWrites.set(dedupeKey, promise);
      return promise;
    };
  }
  return wrapped as unknown as Commands;
}

function buildCommands(ctx: CommandsContext): Commands {
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
    deleteCategory(id, input) {
      return guarded("deleteCategory", ctx, () => a.deleteCategory(id, input));
    },
    applyCategoryDefaults() {
      return guarded("applyCategoryDefaults", ctx, () => a.applyCategoryDefaults());
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
    undoPayablePayment(id, paidTransactionId) {
      return guarded("undoPayablePayment", ctx, () =>
        a.undoPayablePayment(id, paidTransactionId),
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
    createCardPurchase(input) {
      return guarded("createCardPurchase", ctx, () =>
        a.createCardPurchase(input),
      );
    },

    // ── Profile ──────────────────────────────────────────────────
    patchProfile(input) {
      return guarded("patchProfile", ctx, () => a.patchProfile(input));
    },
  };
}
