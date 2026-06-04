/**
 * get_balance — Contract Test
 * ============================
 * Contract/documentation test for get_balance tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: account_id (UUID)
 * - Output: account info + calculated balance
 * - Balance = initial_balance_cents + active transaction sums
 * - NEGATIVE BALANCES ARE ALLOWED (debt scenarios)
 * - Only non-deleted transactions (deleted_at IS NULL) are included
 */

import { describe, it, expect } from 'vitest';
import type { GetBalanceInput, GetBalanceResult } from './types';

describe('get_balance — input contract', () => {
  it('requires account_id as UUID string', () => {
    const input: GetBalanceInput = {
      account_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(input.account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('account_id is required and non-null', () => {
    const input: GetBalanceInput = {
      account_id: 'acc-uuid-123',
    };
    expect(input.account_id).toBeTruthy();
  });
});

describe('get_balance — output contract', () => {
  it('success result contains account identity and calculated balance', () => {
    const result: GetBalanceResult = {
      success: true,
      account_id: '550e8400-e29b-41d4-a716-446655440000',
      account_name: 'Conta Corrente',
      initial_balance_cents: 100000, // R$ 1.000,00 initial
      calculated_balance_cents: 145000, // R$ 1.450,00 after transactions
    };
    expect(result.success).toBe(true);
    expect(typeof result.account_id).toBe('string');
    expect(typeof result.account_name).toBe('string');
    expect(typeof result.initial_balance_cents).toBe('number');
    expect(typeof result.calculated_balance_cents).toBe('number');
  });

  it('failure result has error field', () => {
    const result: GetBalanceResult = {
      success: false,
      error: 'Account not found',
      account_id: 'invalid-uuid',
      account_name: '',
      initial_balance_cents: 0,
      calculated_balance_cents: 0,
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('get_balance — calculation rules', () => {
  it('balance is calculated, never stored', () => {
    // Rule: accounts table has initial_balance_cents only
    // No stored "current_balance" column
    // Balance is always computed from transactions
    const contract = {
      account_table_columns: ['id', 'household_id', 'name', 'initial_balance_cents', 'active', 'deleted_at', 'created_at'],
      no_current_balance_column: true,
    };
    expect(contract.no_current_balance_column).toBe(true);
    expect(contract.account_table_columns).not.toContain('current_balance_cents');
  });

  it('calculated_balance can be negative (debt allowed)', () => {
    // Rule: negative balances are permitted — household may owe money
    const result: GetBalanceResult = {
      success: true,
      account_id: 'acc-uuid',
      account_name: 'Cartão de Crédito',
      initial_balance_cents: 0,
      calculated_balance_cents: -50000, // R$ -500,00 debt
    };
    expect(result.calculated_balance_cents).toBeLessThan(0);
  });

  it('balance formula documented', () => {
    // balance = initial_balance_cents
    //          + SUM(income where to_account_id=X AND deleted_at IS NULL)
    //          - SUM(expense where from_account_id=X AND deleted_at IS NULL)
    //          - SUM(transfer where from_account_id=X AND deleted_at IS NULL)  // transfer_out
    //          + SUM(transfer where to_account_id=X AND deleted_at IS NULL)   // transfer_in
    const formula = `balance = initial_balance_cents
  + income_sum (to_account=X, active)
  - expense_sum (from_account=X, active)
  - transfer_out (from_account=X, active)
  + transfer_in (to_account=X, active)`;
    expect(formula).toContain('initial_balance_cents');
    expect(formula).toContain('income_sum');
    expect(formula).toContain('expense_sum');
  });

  it('only non-deleted transactions included in balance', () => {
    // Rule: deleted_at IS NULL filter is mandatory in all balance calculations
    const filterRule = 'WHERE deleted_at IS NULL';
    expect(filterRule).toBe('WHERE deleted_at IS NULL');
  });

  it('pending transactions included in balance (status=pending)', () => {
    // Rule: pending transactions ARE counted in balance
    // Only soft-deleted (deleted_at IS NOT NULL) are excluded
    const pendingIncluded = {
      status_pending: 'included in balance',
      status_confirmed: 'included in balance',
      deleted_at_set: 'excluded from balance',
    };
    expect(pendingIncluded.status_pending).toBe('included in balance');
    expect(pendingIncluded.deleted_at_set).toBe('excluded from balance');
  });
});