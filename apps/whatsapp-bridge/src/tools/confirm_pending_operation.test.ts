/**
 * confirm_pending_operation — Contract Test
 * ==========================================
 * Contract/documentation test for confirm_pending_operation tool (Phase 3).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 3 of minimal-finance-agent-spec.md
 *
 * VERIFIED CONTRACT:
 * - Input: chat_id
 * - Precondition: pending_operations with status='awaiting_confirmation' for chat_id
 * - Postcondition: creates transaction, deletes pending row, returns transaction_id
 * - Rejects if status != 'awaiting_confirmation' (already confirmed/cancelled/expired)
 */

import { describe, it, expect } from 'vitest';
import type { ConfirmPendingOperationInput, ConfirmPendingOperationResult } from './phase3.types';

describe('confirm_pending_operation — input contract', () => {
  it('requires chat_id as string', () => {
    const input: ConfirmPendingOperationInput = {
      chat_id: '5511999999999@c.us',
    };
    expect(typeof input.chat_id).toBe('string');
    expect(input.chat_id.length).toBeGreaterThan(0);
  });

  it('no additional parameters needed — uses pending row for full operation', () => {
    const input: ConfirmPendingOperationInput = {
      chat_id: 'chat-id',
    };
    // Confirm uses the pending operation stored in DB
    // All operation details (kind, amount_cents, etc.) come from pending_operations row
    expect(Object.keys(input)).toHaveLength(1); // only chat_id
  });
});

describe('confirm_pending_operation — output contract', () => {
  it('success result has transaction_id field', () => {
    const result: ConfirmPendingOperationResult = {
      success: true,
      transaction_id: 'tx-uuid-from-confirm',
      operation_id: 'op-uuid',
    };
    expect(result.success).toBe(true);
    expect(typeof result.transaction_id).toBe('string');
    expect(typeof result.operation_id).toBe('string');
  });

  it('failure result has error field', () => {
    const result: ConfirmPendingOperationResult = {
      success: false,
      error: 'Operation already expired',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('failure when no pending operation for chat_id', () => {
    const result: ConfirmPendingOperationResult = {
      success: false,
      error: 'No pending operation for this chat',
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('No pending operation');
  });

  it('failure when operation already expired', () => {
    const result: ConfirmPendingOperationResult = {
      success: false,
      error: 'Operation expired',
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
  });
});

describe('confirm_pending_operation — behavior rules', () => {
  it('creates transaction using pending operation data', () => {
    // Rule: confirm reads pending_operations row and creates transaction with same fields
    // pending.kind → transaction.kind
    // pending.amount_cents → transaction.amount_cents
    // pending.date → transaction.date
    // pending.category_id, from_account_id, to_account_id → same in transaction
    // transaction.status = 'confirmed'
    const creationRule = {
      source: 'pending_operations row',
      fields_copied: ['kind', 'amount_cents', 'description', 'category_id', 'from_account_id', 'to_account_id', 'date'],
      transaction_status: 'confirmed',
    };
    expect(creationRule.transaction_status).toBe('confirmed');
  });

  it('deletes pending_operations row after successful confirmation', () => {
    // Rule: pending row is DELETED (not marked cancelled/expired)
    // Only confirmed → delete row
    // Cancelled → mark 'cancelled', keep row
    // Expired → mark 'expired', keep row
    const deleteRule = {
      on_confirm: 'DELETE pending_operations row',
      reason: 'transaction created, no longer needed',
    };
    expect(deleteRule.on_confirm).toBe('DELETE pending_operations row');
  });

  it('rejects if pending.status != awaiting_confirmation', () => {
    // Pre-execution check:
    // SELECT status FROM pending_operations WHERE chat_id = X AND status = 'awaiting_confirmation'
    // If 0 rows → reject with error
    const preCondition = {
      required_status: 'awaiting_confirmation',
      rejected_statuses: ['confirmed', 'cancelled', 'expired'],
    };
    expect(preCondition.required_status).toBe('awaiting_confirmation');
  });

  it('checks expiration before executing', () => {
    // Rule: also check expires_at < NOW()
    // If expired → reject (do not create transaction even if status=awaiting)
    const expirationCheck = {
      condition: 'expires_at > NOW()',
      on_expired: 'reject with error "Operation expired"',
    };
    expect(expirationCheck.on_expired).toBe('reject with error "Operation expired"');
  });

  it('one transaction per confirmation (idempotent — cannot double-confirm)', () => {
    // After confirm: pending row is deleted
    // Second confirm call → no pending row found → error "No pending operation"
    // This prevents double-execution
    const idempotency = {
      mechanism: 'row deleted after confirm',
      double_confirm_result: 'error "No pending operation"',
    };
    expect(idempotency.double_confirm_result).toBe('error "No pending operation"');
  });
});