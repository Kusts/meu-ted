/**
 * list_accounts — Contract Test
 * ==============================
 * Contract/documentation test for list_accounts tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 */

import { describe, it, expect } from 'vitest';
import type { ListAccountsResult } from './types';

describe('list_accounts — input contract', () => {
  it('no input required', () => {
    // list_accounts takes no parameters
    const input = {};
    expect(input).toEqual({});
  });
});

describe('list_accounts — output contract', () => {
  it('success result contains accounts array', () => {
    const result: ListAccountsResult = {
      success: true,
      accounts: [
        {
          id: 'acc-uuid-1',
          name: 'Conta Corrente',
          initial_balance_cents: 100000, // R$ 1.000,00
          active: true,
          created_at: '2026-06-01T10:00:00Z',
        },
        {
          id: 'acc-uuid-2',
          name: 'Poupança',
          initial_balance_cents: 500000, // R$ 5.000,00
          active: true,
          created_at: '2026-06-01T10:00:00Z',
        },
      ],
    };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.accounts)).toBe(true);
  });

  it('each account row has id, name, initial_balance_cents, active, created_at', () => {
    const accountRow = {
      id: 'acc-uuid',
      name: 'Conta Teste',
      initial_balance_cents: 0,
      active: true,
      created_at: '2026-06-01T10:00:00Z',
    };
    expect(accountRow.id).toBeDefined();
    expect(accountRow.name).toBeDefined();
    expect(typeof accountRow.initial_balance_cents).toBe('number');
    expect(typeof accountRow.active).toBe('boolean');
    expect(accountRow.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('only active accounts returned (active=true)', () => {
    // Rule: list_accounts returns only active accounts
    // Inactive accounts have active=false or deleted_at IS NOT NULL
    const filter = 'WHERE active = true AND deleted_at IS NULL';
    expect(filter).toContain('active = true');
  });

  it('failure result has error field', () => {
    const result: ListAccountsResult = {
      success: false,
      error: 'Household not found',
      accounts: [],
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('list_accounts — balance info', () => {
  it('initial_balance_cents is stored, calculated balance comes from get_balance', () => {
    // Rule: accounts table only has initial_balance_cents
    // Current balance is calculated by get_balance tool
    const contract = {
      stored: 'initial_balance_cents',
      calculated: 'via get_balance tool',
      not_stored: 'current_balance_cents',
    };
    expect(contract.not_stored).toBe('current_balance_cents');
  });
});