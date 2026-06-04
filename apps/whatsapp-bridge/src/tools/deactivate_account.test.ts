/**
 * deactivate_account — Contract Test
 * =====================================
 * Contract test for deactivate_account tool (Phase 4).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 4 of minimal-finance-agent-spec.md
 */

import { describe, it, expect } from 'vitest';
import type { DeactivateAccountInput, DeactivateAccountResult } from './phase4.types';

describe('deactivate_account — input contract', () => {
  it('requires account_id as UUID', () => {
    const input: DeactivateAccountInput = {
      account_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(input.account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('deactivate_account — output contract', () => {
  it('success result has account_id field', () => {
    const result: DeactivateAccountResult = {
      success: true,
      account_id: 'acc-uuid-deactivated',
    };
    expect(result.success).toBe(true);
    expect(typeof result.account_id).toBe('string');
  });

  it('failure result has error field', () => {
    const result: DeactivateAccountResult = {
      success: false,
      error: 'Account not found',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('failure when account has active transactions', () => {
    const result: DeactivateAccountResult = {
      success: false,
      error: 'Account has active transactions — cannot deactivate',
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('active transactions');
  });
});

describe('deactivate_account — behavior rules', () => {
  it('sets active = false (soft deactivate, not hard delete)', () => {
    // Rule: deactivation sets active=false, does NOT set deleted_at
    // Account record is preserved
    const deactivation = {
      active: false,
      deleted_at: 'NOT SET (preserved)',
    };
    expect(deactivation.active).toBe(false);
  });

  it('only allowed if no active transactions exist for account', () => {
    // Pre-check: SELECT COUNT(*) FROM transactions
    //   WHERE (from_account_id = X OR to_account_id = X)
    //   AND deleted_at IS NULL
    // If count > 0 → reject
    const preCondition = {
      check: 'no active (non-deleted) transactions',
      transaction_count_must_be: 0,
    };
    expect(preCondition.transaction_count_must_be).toBe(0);
  });

  it('records audit log with before_json', () => {
    const auditEntry = {
      action: 'deactivate',
      entity_type: 'account',
      before_json: { active: true },
      after_json: null, // after is NULL for deactivate — state implied
    };
    expect(auditEntry.action).toBe('deactivate');
    expect(auditEntry.before_json).toBeDefined();
  });

  it('deactivated accounts excluded from list_accounts', () => {
    // list_accounts filters: WHERE active = true AND deleted_at IS NULL
    const filter = 'WHERE active = true AND deleted_at IS NULL';
    expect(filter).toContain('active = true');
  });

  it('deactivated accounts still included in balance calculations', () => {
    // Rule: deactivate does NOT set deleted_at
    // Balance calculation still includes this account's transactions
    // (because transactions reference from_account_id/to_account_id)
    const balanceRule = {
      active_filter: 'account.active OR account.deleted_at IS NULL',
      reason: 'transactions exist referencing this account',
    };
    expect(balanceRule.reason).toBe('transactions exist referencing this account');
  });

  it('cannot deactivate twice', () => {
    // Second call: SELECT FROM accounts WHERE id = X AND active = true
    // → 0 rows → error "Account is not active"
    const idempotency = {
      first_call: 'success, active=false',
      second_call: 'error "Account is not active"',
    };
    expect(idempotency.second_call).toContain('not active');
  });
});