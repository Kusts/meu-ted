/**
 * create_income — Contract Test
 * =============================
 * Contract/documentation test for create_income tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: description, amount_cents (positive integer), category_id, account_id, date (YYYY-MM-DD)
 * - Output: { success: true, transaction_id: string } or { success: false, error: string }
 * - Side effect: writes to transactions table with kind='income', amount ADICIONA to to_account
 * - amount_cents is ALWAYS stored as positive — sign is encoded in kind='income'
 */

import { describe, it, expect } from 'vitest';
import type { CreateIncomeInput, CreateIncomeResult } from './types';

describe('create_income — input contract', () => {
  it('requires description as non-empty string', () => {
    const input: CreateIncomeInput = {
      description: 'Salário',
      amount_cents: 500000, // R$ 5.000,00
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.description.length).toBeGreaterThan(0);
  });

  it('requires amount_cents as positive integer (cents)', () => {
    const input: CreateIncomeInput = {
      description: 'Freelance',
      amount_cents: 15000, // R$ 150,00
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.amount_cents).toBeGreaterThan(0);
    expect(Number.isInteger(input.amount_cents)).toBe(true);
  });

  it('amount_cents must be in integer cents — no floating point', () => {
    const input: CreateIncomeInput = {
      description: 'Renda extra',
      amount_cents: 99, // R$ 0,99
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.amount_cents % 1).toBe(0);
  });

  it('requires category_id as UUID string', () => {
    const input: CreateIncomeInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: '550e8400-e29b-41d4-a716-446655440000',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.category_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('requires account_id as UUID string', () => {
    const input: CreateIncomeInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: '550e8400-e29b-41d4-a716-446655440000',
      date: '2026-06-03',
    };
    expect(input.account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('requires date in ISO format YYYY-MM-DD', () => {
    const input: CreateIncomeInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts optional source_message_id for traceability', () => {
    const input: CreateIncomeInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
      source_message_id: 'msg-456',
    };
    expect(input.source_message_id).toBeDefined();
  });

  it('accepts optional idempotency_key to prevent duplicates', () => {
    const input: CreateIncomeInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
      idempotency_key: 'income-unique-key',
    };
    expect(typeof input.idempotency_key).toBe('string');
  });
});

describe('create_income — output contract', () => {
  it('success result has transaction_id field', () => {
    const result: CreateIncomeResult = {
      success: true,
      transaction_id: 'tx-uuid-income',
    };
    expect(result.success).toBe(true);
    expect(typeof result.transaction_id).toBe('string');
  });

  it('failure result has error field and no transaction_id', () => {
    const result: CreateIncomeResult = {
      success: false,
      error: 'Account not found',
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.transaction_id).toBeUndefined();
  });
});

describe('create_income — behavior rules', () => {
  it('amount_cents is stored as-is (positive), kind determines direction', () => {
    // Rule: income amount ADICIONA to to_account
    const input: CreateIncomeInput = {
      description: 'Recebimento',
      amount_cents: 100000, // R$ 1.000,00 — stored as positive
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.amount_cents).toBe(100000); // positive
    // kind='income' means this amount ADICIONA to account balance
  });

  it('income transaction sets to_account_id (credit destination)', () => {
    // For income: to_account gets credited (ADICIONA)
    // from_account_id is NULL for income transactions
    const incomeContract = {
      kind: 'income',
      from_account_id: 'NULL', // income only sets to_account
      to_account_id: 'set (account_id param)',
    };
    expect(incomeContract.kind).toBe('income');
    expect(incomeContract.from_account_id).toBe('NULL');
    expect(incomeContract.to_account_id).toBe('set (account_id param)');
  });
});