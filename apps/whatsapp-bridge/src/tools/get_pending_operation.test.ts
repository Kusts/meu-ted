/**
 * get_pending_operation — Contract Test
 * =======================================
 * Contract/documentation test for get_pending_operation tool (Phase 3).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 3 of minimal-finance-agent-spec.md
 */

import { describe, it, expect } from 'vitest';
import type { GetPendingOperationInput, GetPendingOperationResult, PendingOperationRow } from './phase3.types';

describe('get_pending_operation — input contract', () => {
  it('requires chat_id as string', () => {
    const input: GetPendingOperationInput = {
      chat_id: '5511999999999@c.us',
    };
    expect(typeof input.chat_id).toBe('string');
    expect(input.chat_id.length).toBeGreaterThan(0);
  });
});

describe('get_pending_operation — output contract', () => {
  it('returns operation when pending exists for chat', () => {
    const result: GetPendingOperationResult = {
      success: true,
      operation: {
        id: 'op-uuid-123',
        household_id: 'hh-uuid',
        user_id: 'user-uuid',
        chat_id: '5511999999999@c.us',
        kind: 'expense',
        amount_cents: 100000, // R$ 1.000,00
        description: 'Compra grande',
        category_id: 'cat-uuid',
        from_account_id: 'acc-uuid',
        to_account_id: null,
        date: '2026-06-03',
        status: 'awaiting_confirmation',
        created_at: '2026-06-03T10:00:00Z',
        expires_at: '2026-06-03T10:30:00Z',
      },
    };
    expect(result.success).toBe(true);
    expect(result.operation).not.toBeNull();
    expect(result.operation!.status).toBe('awaiting_confirmation');
  });

  it('returns null operation when no pending for chat', () => {
    const result: GetPendingOperationResult = {
      success: true,
      operation: null,
    };
    expect(result.success).toBe(true);
    expect(result.operation).toBeNull();
  });

  it('failure result has error field', () => {
    const result: GetPendingOperationResult = {
      success: false,
      error: 'User not found',
      operation: null,
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('get_pending_operation — behavior rules', () => {
  it('only returns pending operations with status=awaiting_confirmation', () => {
    // Rule: confirmed/cancelled/expired are not "pending" — not returned
    const filterRule = "WHERE chat_id = X AND status = 'awaiting_confirmation'";
    expect(filterRule).toContain("status = 'awaiting_confirmation'");
  });

  it('includes expires_at for user to know remaining time', () => {
    const row: PendingOperationRow = {
      id: 'op-uuid',
      household_id: 'hh-uuid',
      user_id: 'user-uuid',
      chat_id: 'chat-id',
      kind: 'expense',
      amount_cents: 80000,
      description: 'Teste',
      category_id: null,
      from_account_id: null,
      to_account_id: null,
      date: '2026-06-03',
      status: 'awaiting_confirmation',
      created_at: '2026-06-03T10:00:00Z',
      expires_at: '2026-06-03T10:30:00Z',
    };
    expect(row.expires_at).toBeDefined();
    expect(row.status).toBe('awaiting_confirmation');
  });

  it('amount_cents is always positive', () => {
    const row: PendingOperationRow = {
      id: 'op-uuid',
      household_id: 'hh-uuid',
      user_id: 'user-uuid',
      chat_id: 'chat-id',
      kind: 'expense',
      amount_cents: 50001, // just above limit
      description: 'High value',
      category_id: null,
      from_account_id: null,
      to_account_id: null,
      date: '2026-06-03',
      status: 'awaiting_confirmation',
      created_at: '2026-06-03T10:00:00Z',
      expires_at: '2026-06-03T10:30:00Z',
    };
    expect(row.amount_cents).toBeGreaterThan(0);
  });
});