/**
 * Phase 3: High-Value Confirmation + Pending Operations — Contract Tests
 * ========================================================================
 * These are CONTRACT/DOCUMENTATION tests — they verify that the Phase 3
 * behavior and tool signatures match the spec.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 3
 *
 * CONFIRMED: boundary strict — zero financial logic in Node/bridge.
 * All financial decisions are made by the Pi agent via tools.
 */

// ============================================================
// Phase 3 Input/Output Types
// ============================================================

export interface GetPendingOperationInput {
  chat_id: string;
}

export interface ConfirmPendingOperationInput {
  chat_id: string;
}

export interface CancelPendingOperationInput {
  chat_id: string;
}

export interface GetPendingOperationResult {
  success: boolean;
  error?: string;
  operation: PendingOperationRow | null;
}

export interface ConfirmPendingOperationResult {
  success: boolean;
  error?: string;
  transaction_id?: string;
  operation_id?: string;
}

export interface CancelPendingOperationResult {
  success: boolean;
  error?: string;
  operation_id?: string;
}

// ============================================================
// Pending Operation Row
// ============================================================

export interface PendingOperationRow {
  id: string;
  household_id: string;
  user_id: string;
  chat_id: string;
  kind: 'expense' | 'income' | 'transfer';
  amount_cents: number;          // always positive
  description: string | null;
  category_id: string | null;
  from_account_id: string | null;
  to_account_id: string | null;
  date: string;                   // ISO date YYYY-MM-DD
  status: 'awaiting_confirmation' | 'confirmed' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string;
}

// ============================================================
// High-Value Rule (per household configuration)
// ============================================================

/**
 * HIGH-VALUE CONFIRMATION RULE
 * ============================
 * For any operation (expense/income/transfer):
 *   if amount_cents > household.high_value_limit_cents
 *   → create pending_operation (do NOT execute yet)
 *   → Pi asks user: "Confirma operação de R$ X,XX? (sim/não)"
 *
 * Default high_value_limit_cents = 50000 (R$ 500,00)
 * Configurable per household in households.high_value_limit_cents
 *
 * Below limit: execute immediately (Phase 2 behavior)
 * Above limit: create pending_operations row, await confirmation
 */

// ============================================================
// Confirmation Flow
// ============================================================

/**
 * CONFIRMATION FLOW
 * =================
 * 1. User sends message → Pi processes
 * 2. Pi calls create_expense/income/transfer
 * 3. If amount_cents > high_value_limit_cents:
 *    - DO NOT create transaction yet
 *    - Create pending_operations row with status='awaiting_confirmation'
 *    - expires_at = NOW() + 30 minutes
 *    - Pi sends: "Valor acima de R$ 500,00. Confirma? (sim/não)"
 * 4. User replies:
 *    - "sim" → Pi calls confirm_pending_operation(chat_id)
 *              → creates transaction with status='confirmed'
 *              → deletes pending_operations row
 *              → Pi sends confirmation message
 *    - "não" → Pi calls cancel_pending_operation(chat_id)
 *              → marks pending_operations status='cancelled'
 *              → Pi sends cancellation message
 *    - no reply in 30min → expired
 *              → marks pending_operations status='expired'
 *              → Pi sends expiration message
 */

// ============================================================
// Expiration Behavior
// ============================================================

/**
 * EXPIRATION BEHAVIOR
 * ===================
 * - expires_at = created_at + 30 minutes
 * - Before executing confirm: check if status != 'awaiting_confirmation'
 *   If status = 'expired' → reject, do not execute
 *   If status = 'confirmed'/'cancelled' → already processed, skip
 * - Background cleanup: pending operations with status='expired' can be
 *   marked asynchronously (Phase 3 does not require background worker)
 * - User cannot confirm expired operations
 */

// ============================================================
// Allow-List Rule
// ============================================================

/**
 * ALLOW-LIST RULE
 * ===============
 * Only users with phone in users table AND active=true can interact.
 * - Inactive users: receive rejection message
 * - Unknown phones: receive rejection message
 * - This is enforced by Pi agent using list_users tool, not by bridge
 *
 * Bridge only routes messages — does not check allow-list.
 * Pi agent checks allow-list before processing commands.
 */

// ============================================================
// Invariants
// ============================================================

/**
 * INVARIANTS — Phase 3
 * ====================
 * 1. One pending operation per chat at a time
 * 2. Only 'awaiting_confirmation' status operations can be confirmed/cancelled
 * 3. Expired operations cannot be confirmed
 * 4. High-value check uses household.high_value_limit_cents (default 50000)
 * 5. pending_operations does NOT affect balances — only confirmed transactions do
 * 6. After confirmation: pending row deleted (not marked), transaction created
 * 7. After cancellation: pending row marked 'cancelled' (not deleted)
 * 8. After expiration: pending row marked 'expired' (not deleted)
 */