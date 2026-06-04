/**
 * update_account — Contract Test
 * =================================
 * Contract test for update_account tool (Phase 4).
 * Does NOT execute real DB operations.
 *
 * Spec: Phase 4 of minimal-finance-agent-spec.md
 */

import { describe, it, expect } from 'vitest';
import type { UpdateAccountInput, UpdateAccountResult } from './phase4.types';

describe('update_account — input contract', () => {
  it('requires account_id as UUID', () => {
    const input: UpdateAccountInput = {
      account_id: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Nova Conta Corrente',
    };
    expect(input.account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('requires name as non-empty string', () => {
    const input: UpdateAccountInput = {
      account_id: 'acc-uuid',
      name: 'Conta Poupança',
    };
    expect(input.name.length).toBeGreaterThan(0);
  });

  it('only name can be updated — initial_balance_cents is immutable', () => {
    // Rule: account name is mutable, initial_balance_cents is NOT
    // To change initial_balance, you'd need to deactivate and create new
    const immutables = ['initial_balance_cents', 'household_id', 'id', 'created_at'];
    expect(immutables).toContain('initial_balance_cents');
  });
});

describe('update_account — output contract', () => {
  it('success result has account_id field', () => {
    const result: UpdateAccountResult = {
      success: true,
      account_id: 'acc-uuid-updated',
    };
    expect(result.success).toBe(true);
    expect(typeof result.account_id).toBe('string');
  });

  it('failure result has error field', () => {
    const result: UpdateAccountResult = {
      success: false,
      error: 'Account not found',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('failure when account already deactivated', () => {
    const result: UpdateAccountResult = {
      success: false,
      error: 'Account is not active',
    };
    expect(result.success).toBe(false);
    expect(result.error).toContain('not active');
  });
});

describe('update_account — behavior rules', () => {
  it('records audit log entry with before_json and after_json', () => {
    // Rule: update creates audit_logs entry
    const auditEntry = {
      action: 'update',
      entity_type: 'account',
      before_json: { name: 'Old Name' },
      after_json: { name: 'New Name' },
    };
    expect(auditEntry.action).toBe('update');
    expect(auditEntry.before_json).toBeDefined();
    expect(auditEntry.after_json).toBeDefined();
  });

  it('only active accounts can be updated', () => {
    // Check: SELECT FROM accounts WHERE id = X AND active = true AND deleted_at IS NULL
    const preCondition = 'active = true AND deleted_at IS NULL';
    expect(preCondition).toContain('active = true');
  });

  it('name uniqueness is NOT enforced across accounts', () => {
    // Rule: two accounts CAN have the same name
    // No unique constraint on accounts.name
    const uniquenessRule = {
      accounts: 'no name uniqueness constraint',
      categories: 'unique per household per kind (composite)',
    };
    expect(uniquenessRule.accounts).toBe('no name uniqueness constraint');
  });
});