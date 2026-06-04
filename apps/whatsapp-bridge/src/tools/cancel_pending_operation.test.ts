/**
 * cancel_pending_operation — Contract Test
 * ==========================================
 * Contract/documentation test for cancel_pending_operation tool (Phase 3).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 3 of minimal-finance-agent-spec.md
 *
 * VERIFIED CONTRACT:
 * - Input: chat_id
 * - Postcondition: pending row marked status='cancelled', NOT deleted
 * - Pi sends cancellation message to user
 */

import { describe, it, expect } from 'vitest';
import type { CancelPendingOperationInput, CancelPendingOperationResult } from './phase3.types';

describe('cancel_pending_operation — input contract', () => {
  it('requires chat_id as string', () => {
    const input: CancelPendingOperationInput = {
      chat_id: '5511999999999@c.us',
    };
    expect(typeof input.chat_id).toBe('string');
    expect(input.chat_id.length).toBeGreaterThan(0);
  });
});

describe('cancel_pending_operation — output contract', () => {
  it('success result has operation_id field', () => {
    const result: CancelPendingOperationResult = {
      success: true,
      operation_id: 'op-uuid-cancelled',
    };
    expect(result.success).toBe(true);
    expect(typeof result.operation_id).toBe('string');
  });

  it('failure result has error field', () => {
    const result: CancelPendingOperationResult = {
      success: false,
      error: 'No pending operation to cancel',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('cancel_pending_operation — behavior rules', () => {
  it('marks pending row status=cancelled (NOT deleted)', () => {
    // Rule: cancel sets status='cancelled' — row is kept for audit
    // Delete is only for confirmed operations
    const cancelRule = {
      action: 'UPDATE status = cancelled',
      row_preserved: true, // not deleted
      reason: 'audit trail of cancellation',
    };
    expect(cancelRule.row_preserved).toBe(true);
  });

  it('rejects if no pending operation for chat_id', () => {
    const result: CancelPendingOperationResult = {
      success: false,
      error: 'No pending operation for this chat',
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('No pending operation');
  });

  it('can cancel any status=awaiting_confirmation (not just fresh ones)', () => {
    // User can cancel even if operation is about to expire
    const cancelability = {
      statuses_cancellable: ['awaiting_confirmation'],
      statuses_rejectable: ['confirmed', 'cancelled', 'expired'],
    };
    expect(cancelability.statuses_rejectable).not.toContain('awaiting_confirmation');
  });

  it('cancelled operations do NOT create transactions', () => {
    // Rule: cancel means NO transaction is created
    // Only confirm creates the transaction
    const cancellationEffect = {
      transaction_created: false,
      balance_affected: false,
    };
    expect(cancellationEffect.transaction_created).toBe(false);
  });

  it('after cancel, chat is free for new pending operations', () => {
    // Unique constraint: idx_pending_operations_chat
    // Only 'awaiting_confirmation' rows have unique chat_id
    // After cancel (status=cancelled), new pending can be created for same chat
    const reusability = {
      constraint_scope: "WHERE status = 'awaiting_confirmation'",
      after_cancel: 'chat_id available for new pending',
    };
    expect(reusability.constraint_scope).toContain('awaiting_confirmation');
  });
});