/**
 * Finance Agent Tools — Phase 2 Contract Definitions
 * ====================================================
 * These are CONTRACT/DOCUMENTATION tests — they verify that the tool signatures
 * and behavior match the spec. They do NOT execute real database operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2 (Core Financial Tools)
 *
 * Testing philosophy:
 * - We test the CONTRACT (input/output shapes, invariants) not the EXECUTION
 * - Each tool has a corresponding test file that validates the contract
 * - Real execution tests (DB persistence, calculations) are integration tests
 *   that require a live Postgres instance
 */

// ============================================================
// Tool Result Types
// ============================================================

export interface ToolResult {
  success: boolean;
  error?: string;
}

export interface CreateExpenseResult extends ToolResult {
  transaction_id?: string;
}

export interface CreateIncomeResult extends ToolResult {
  transaction_id?: string;
}

export interface CreateTransferResult extends ToolResult {
  transaction_id?: string;
}

export interface GetBalanceResult extends ToolResult {
  account_id: string;
  account_name: string;
  initial_balance_cents: number;
  calculated_balance_cents: number; // initial + active transactions
}

export interface GetMonthSummaryResult extends ToolResult {
  month: string;           // YYYY-MM format
  total_income_cents: number;
  total_expense_cents: number;
  net_balance_cents: number; // income - expense
  transaction_count: number;
}

export interface ListRecentTransactionsResult extends ToolResult {
  transactions: TransactionRow[];
  count: number;
}

export interface ListAccountsResult extends ToolResult {
  accounts: AccountRow[];
}

export interface CreateAccountResult extends ToolResult {
  account_id?: string;
}

export interface ListCategoriesResult extends ToolResult {
  categories: CategoryRow[];
}

export interface CreateCategoryResult extends ToolResult {
  category_id?: string;
}

export interface UpdateAccountResult extends ToolResult {
  account_id?: string;
}

export interface DeactivateAccountResult extends ToolResult {
  account_id?: string;
}

export interface UpdateCategoryResult extends ToolResult {
  category_id?: string;
}

export interface DeactivateCategoryResult extends ToolResult {
  category_id?: string;
}

export interface UpdateTransactionResult extends ToolResult {
  transaction_id?: string;
}

export interface DeleteTransactionResult extends ToolResult {
  transaction_id?: string;
}

export interface GetPendingOperationResult extends ToolResult {
  operation?: {
    id: string;
    chat_id: string;
    operation_type: string;
    operation_data: Record<string, unknown>;
    expires_at: Date;
    created_at: Date;
  } | null;
}

export interface ConfirmPendingOperationResult extends ToolResult {
  operation_id?: string;
  result?: { success: boolean; message?: string; transaction_id?: string };
}

export interface CancelPendingOperationResult extends ToolResult {
  operation_id?: string;
}

export interface AuditLogRow {
  id: string;
  household_id: string;
  chat_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown> | null;
  created_at: Date;
}

export interface AuditLogsResult extends ToolResult {
  logs: AuditLogRow[];
  count: number;
}

export interface UndoLastActionResult extends ToolResult {
  undone_action?: string;
  entity_id?: string;
  details?: string;
}

// ============================================================
// Domain Entity Shapes (as stored/returned)
// ============================================================

export interface TransactionRow {
  id: string;
  kind: 'expense' | 'income' | 'transfer';
  amount_cents: number;       // always positive
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  from_account_id: string | null;
  from_account_name: string | null;
  to_account_id: string | null;
  to_account_name: string | null;
  date: string;              // ISO date YYYY-MM-DD
  status: 'confirmed' | 'pending';
  source_message_id: string | null;
  created_at: string;        // ISO timestamp
}

export interface AccountRow {
  id: string;
  name: string;
  initial_balance_cents: number;
  active: boolean;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  name: string;
  kind: 'expense' | 'income';
  active: boolean;
}

// ============================================================
// Tool Input Interfaces (as declared to the LLM/Pi)
// ============================================================

export interface CreateExpenseInput {
  description: string;
  amount_cents: number;      // positive integer, in cents
  category_id: string;
  account_id: string;
  date: string;               // ISO date YYYY-MM-DD
  source_message_id?: string;
  idempotency_key?: string;
}

export interface CreateIncomeInput {
  description: string;
  amount_cents: number;
  category_id: string;
  account_id: string;
  date: string;
  source_message_id?: string;
  idempotency_key?: string;
}

export interface CreateTransferInput {
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  description: string;
  date: string;
  source_message_id?: string;
  idempotency_key?: string;
}

export interface GetBalanceInput {
  account_id: string;
}

export interface GetMonthSummaryInput {
  year: number;
  month: number;              // 1-12
}

export interface ListRecentTransactionsInput {
  limit?: number;            // default 10, max 100
  account_id?: string;       // optional filter
}

export interface CreateAccountInput {
  name: string;
  initial_balance_cents: number; // can be 0 or positive, negative means debt
}

export interface CreateCategoryInput {
  name: string;
  kind: 'expense' | 'income';
}

// ============================================================
// Balance Calculation Rules (documentation)
// ============================================================

/**
 * BALANCE CALCULATION FORMULA
 * ===========================
 * For any account:
 *
 * balance = initial_balance_cents + income_sum - expense_sum + transfer_out - transfer_in
 *
 * Where:
 * - income_sum   = SUM(amount_cents) WHERE kind='income' AND to_account_id=X AND deleted_at IS NULL
 * - expense_sum  = SUM(amount_cents) WHERE kind='expense' AND from_account_id=X AND deleted_at IS NULL
 * - transfer_out = SUM(amount_cents) WHERE kind='transfer' AND from_account_id=X AND deleted_at IS NULL
 * - transfer_in  = SUM(amount_cents) WHERE kind='transfer' AND to_account_id=X AND deleted_at IS NULL
 *
 * NEGATIVE BALANCES ARE ALLOWED (debt scenario).
 * Only non-deleted transactions (deleted_at IS NULL) are included.
 */

// ============================================================
// Invariants (rules that must hold true)
// ============================================================

/**
 * INVARIANTS
 * ==========
 * 1. All monetary values are in INTEGER CENTS — never float/decimal
 * 2. amount_cents is ALWAYS POSITIVE — sign encoded in `kind`
 * 3. expense:  amount SUBTRAI from from_account
 * 4. income:   amount ADICIONA to to_account
 * 5. transfer: amount SUBTRAI from from_account, ADICIONA to to_account
 * 6. Soft delete only — transactions never physically deleted, only marked deleted_at
 * 7. Pending operations (pending_operations) are Phase 3 concern, not Phase 2
 * 8. Audit logs are Phase 4 concern, not Phase 2
 */