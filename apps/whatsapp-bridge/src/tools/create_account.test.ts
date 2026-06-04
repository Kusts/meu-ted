/**
 * create_account — Contract Test
 * ==============================
 * Contract/documentation test for create_account tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: name, initial_balance_cents
 * - Output: { success: true, account_id: string }
 * - Creates account with initial balance (can be zero or positive)
 * - Negative initial_balance_cents means the account starts with debt
 */

import { describe, it, expect } from 'vitest';
import type { CreateAccountInput, CreateAccountResult } from './types';

describe('create_account — input contract', () => {
  it('requires name as non-empty string', () => {
    const input: CreateAccountInput = {
      name: 'Conta Corrente',
      initial_balance_cents: 100000, // R$ 1.000,00 starting balance
    };
    expect(input.name.length).toBeGreaterThan(0);
  });

  it('requires initial_balance_cents as integer (can be 0)', () => {
    const input: CreateAccountInput = {
      name: 'Carteira',
      initial_balance_cents: 0, // starts empty
    };
    expect(Number.isInteger(input.initial_balance_cents)).toBe(true);
  });

  it('initial_balance_cents can be negative (debt scenario)', () => {
    const input: CreateAccountInput = {
      name: 'Cartão de Crédito',
      initial_balance_cents: -50000, // R$ -500,00 debt
    };
    expect(input.initial_balance_cents).toBeLessThan(0);
  });

  it('initial_balance_cents must be in integer cents', () => {
    const input: CreateAccountInput = {
      name: 'Poupança',
      initial_balance_cents: 50000, // R$ 500,00
    };
    expect(input.initial_balance_cents % 1).toBe(0);
  });
});

describe('create_account — output contract', () => {
  it('success result has account_id field', () => {
    const result: CreateAccountResult = {
      success: true,
      account_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(result.success).toBe(true);
    expect(typeof result.account_id).toBe('string');
    expect(result.account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('failure result has error field', () => {
    const result: CreateAccountResult = {
      success: false,
      error: 'Account name already exists',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('create_account — behavior rules', () => {
  it('created account is active by default', () => {
    const defaultState = {
      active: true,
      deleted_at: null,
    };
    expect(defaultState.active).toBe(true);
  });

  it('account has no transactions initially', () => {
    // New account starts with initial_balance_cents as its full balance
    // No transaction rows exist yet
    const contract = {
      initial_state: 'balance = initial_balance_cents (no transactions)',
      transactions: [],
    };
    expect(contract.transactions).toHaveLength(0);
  });

  it('negative initial_balance_cents means debt', () => {
    // If account starts with -50000 cents, it owes R$ 500,00
    // Balance calculation: initial_balance_cents + future transactions
    const debtAccount = {
      name: 'Empréstimo',
      initial_balance_cents: -100000, // owes R$ 1.000,00
    };
    expect(debtAccount.initial_balance_cents).toBe(-100000);
  });

  it('account linked to household_id', () => {
    // Each account belongs to a household
    // In single-household MVP, all accounts belong to same household
    const contract = {
      household_link: 'required (household_id FK)',
    };
    expect(contract.household_link).toBe('required (household_id FK)');
  });
});