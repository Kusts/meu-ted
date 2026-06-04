/**
 * Phase 4: Full CRUD + Audit Logs + Undo — Contract Tests
 * ==========================================================
 * These are CONTRACT/DOCUMENTATION tests — they verify that Phase 4
 * tool signatures and behavior match the spec.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 4
 *
 * CONFIRMED: boundary strict — zero financial logic in Node/bridge.
 */

// ============================================================
// Phase 4 Input/Output Types
// ============================================================

export interface UpdateAccountInput {
  account_id: string;
  name: string;
}

export interface DeactivateAccountInput {
  account_id: string;
}

export interface UpdateCategoryInput {
  category_id: string;
  name: string;
}

export interface DeactivateCategoryInput {
  category_id: string;
}

export interface UpdateTransactionInput {
  transaction_id: string;
  description?: string;
  amount_cents?: number;      // optional — if changed, reverts old, applies new
  category_id?: string;       // optional
  from_account_id?: string;   // optional (for expense/transfer)
  to_account_id?: string;     // optional (for income/transfer)
  date?: string;              // optional
}

export interface DeleteTransactionInput {
  transaction_id: string;
}

export interface UndoLastActionInput {
  // No parameters — undoes the last action for the household
  // Uses household.last_audit_log_id to find the action
}

export interface UpdateAccountResult extends BaseResult {
  account_id?: string;
}

export interface DeactivateAccountResult extends BaseResult {
  account_id?: string;
}

export interface UpdateCategoryResult extends BaseResult {
  category_id?: string;
}

export interface DeactivateCategoryResult extends BaseResult {
  category_id?: string;
}

export interface UpdateTransactionResult extends BaseResult {
  transaction_id?: string;
  before_cents?: number;      // for audit — previous amount
  after_cents?: number;       // for audit — new amount
}

export interface DeleteTransactionResult extends BaseResult {
  transaction_id?: string;
  reverted_cents?: number;    // amount that was reverted (for audit)
}

export interface UndoLastActionResult extends BaseResult {
  undone_action?: string;     // 'create_transaction', 'update_transaction', etc.
  entity_id?: string;
  details?: string;            // human-readable description of what was undone
}

// ============================================================
// Base result type
// ============================================================

interface BaseResult {
  success: boolean;
  error?: string;
}

// ============================================================
// Undo Eligibility Rules
// ============================================================

/**
 * UNDO LAST ACTION — ELIGIBILITY RULES
 * ====================================
 * Only the following actions are eligible for undo:
 * 1. create_transaction — reverts by deleting the transaction
 * 2. update_transaction — reverts by restoring before_json
 * 3. delete_transaction — reverts by undeleting (clearing deleted_at)
 *
 * NOT eligible for undo:
 * - confirm_pending_operation (transaction already created)
 * - cancel_pending_operation (nothing to undo — operation cancelled)
 * - undo itself (cannot chain undos)
 * - create_account, update_account, deactivate_account (Phase 5+)
 * - create_category, update_category, deactivate_category (Phase 5+)
 *
 * UNDO is per-household — only undoes the last action of THAT household.
 * Uses household.last_audit_log_id to find the target audit entry.
 */

// ============================================================
// Audit Log Entry Shape
// ============================================================

/**
 * AUDIT LOG ENTRY — REQUIRED FIELDS
 * ===================================
 * For every write operation, create audit_logs entry with:
 * - action: create | update | delete | confirm | cancel | undo
 * - entity_type: transaction | account | category | pending_operation
 * - entity_id: UUID of the affected entity
 * - before_json: NULL for create, full state before for update/delete
 * - after_json: full state after for create/update, NULL for delete
 *
 * before_json and after_json are NOT required to be deep clones —
 * they must capture the semantic state needed to revert the operation.
 */

// ============================================================
// Soft Delete Rules (Phase 4)
// ============================================================

/**
 * SOFT DELETE RULES
 * =================
 * update_transaction:
 *   - Updates description, amount_cents, category_id, from_account_id, to_account_id, date
 *   - Records before_json and after_json in audit_logs
 *   - Reverts balance impact of old values, applies new values
 *
 * delete_transaction:
 *   - Sets deleted_at = NOW() (soft delete)
 *   - Records before_json in audit_logs
 *   - Reverts the balance impact of the transaction
 *
 * deactivate_account:
 *   - Sets active = false
 *   - ONLY allowed if account has NO active (non-deleted) transactions
 *   - Records before_json in audit_logs
 *
 * deactivate_category:
 *   - Sets active = false
 *   - If category has active transactions, those transactions remain but category
 *     becomes inactive for new transactions
 *   - Records before_json in audit_logs
 */

// ============================================================
// Invariants
// ============================================================

/**
 * INVARIANTS — Phase 4
 * ====================
 * 1. audit_logs table is append-only — no updates or deletes
 * 2. undo_last_action uses household.last_audit_log_id to find target
 * 3. undo is idempotent — undoing already-undone action returns error
 * 4. deactivate_account only allowed if no active transactions exist
 * 5. delete_transaction reverts balance impact (adds back or subtracts based on kind)
 * 6. update_transaction: old balances reverted, new balances applied
 * 7. kind of transaction cannot be changed (expense stays expense, etc.)
 */