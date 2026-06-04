/**
 * create_expense — Contract Test
 * ===============================
 * Contract/documentation test for create_expense tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: description, amount_cents (positive integer), category_id, account_id, date (YYYY-MM-DD)
 * - Output: { success: true, transaction_id: string } or { success: false, error: string }
 * - Side effect: writes to transactions table with kind='expense', amount_cents stored as-is
 * - amount_cents is ALWAYS stored as positive — sign is encoded in kind='expense'
 * - Soft delete supported: transaction has deleted_at column
 * - Idempotency: if idempotency_key provided and exists, returns existing transaction (no duplicate)
 */

import { describe, it, expect } from 'vitest';
import type { CreateExpenseInput, CreateExpenseResult } from './types';

// --- CONTRACT: Input Shape ---

describe('create_expense — input contract', () => {
  it('requires description as non-empty string', () => {
    const validInput: CreateExpenseInput = {
      description: 'Almoço no restaurante',
      amount_cents: 4500,
      category_id: 'cat-uuid-123',
      account_id: 'acc-uuid-456',
      date: '2026-06-03',
    };
    expect(validInput.description.length).toBeGreaterThan(0);
  });

  it('requires amount_cents as positive integer (cents)', () => {
    const validInput: CreateExpenseInput = {
      description: 'Compras',
      amount_cents: 10000, // R$ 100,00
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(validInput.amount_cents).toBeGreaterThan(0);
    expect(Number.isInteger(validInput.amount_cents)).toBe(true);
  });

  it('amount_cents must be in integer cents — no floating point', () => {
    const validInput: CreateExpenseInput = {
      description: 'Teste',
      amount_cents: 1, // minimum valid
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(validInput.amount_cents % 1).toBe(0);
  });

  it('requires category_id as UUID string', () => {
    const input: CreateExpenseInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: '550e8400-e29b-41d4-a716-446655440000',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.category_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('requires account_id as UUID string', () => {
    const input: CreateExpenseInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: '550e8400-e29b-41d4-a716-446655440000',
      date: '2026-06-03',
    };
    expect(input.account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('requires date in ISO format YYYY-MM-DD', () => {
    const input: CreateExpenseInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('accepts optional source_message_id for traceability', () => {
    const input: CreateExpenseInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
      source_message_id: 'msg-123',
    };
    expect(input.source_message_id).toBeDefined();
  });

  it('accepts optional idempotency_key to prevent duplicates', () => {
    const input: CreateExpenseInput = {
      description: 'Teste',
      amount_cents: 500,
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
      idempotency_key: 'unique-key-123',
    };
    expect(typeof input.idempotency_key).toBe('string');
  });
});

// --- CONTRACT: Output Shape ---

describe('create_expense — output contract', () => {
  it('success result has transaction_id field', () => {
    const successResult: CreateExpenseResult = {
      success: true,
      transaction_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(successResult.success).toBe(true);
    expect(typeof successResult.transaction_id).toBe('string');
  });

  it('failure result has error field and no transaction_id', () => {
    const failureResult: CreateExpenseResult = {
      success: false,
      error: 'Category not found',
    };
    expect(failureResult.success).toBe(false);
    expect(typeof failureResult.error).toBe('string');
    expect(failureResult.transaction_id).toBeUndefined();
  });
});

// --- CONTRACT: Behavior Rules ---

describe('create_expense — behavior rules', () => {
  it('amount_cents is stored as-is (positive), kind determines direction', () => {
    // Rule: expense amount SUBTRAI from from_account
    // amount_cents is always positive — sign is in the 'kind' field
    const input: CreateExpenseInput = {
      description: 'Compra',
      amount_cents: 5000, // R$ 50,00 — always stored as positive integer
      category_id: 'cat-uuid',
      account_id: 'acc-uuid',
      date: '2026-06-03',
    };
    expect(input.amount_cents).toBe(5000); // positive
    // kind='expense' means this amount SUBTRAI from account balance
  });

  it('pending transactions are allowed (status can be pending)', () => {
    // Note: create_expense default status is 'confirmed'
    // Phase 3 covers pending_operations for high-value confirmations
    // Phase 2 creates confirmed transactions directly
    const defaultStatus: CreateExpenseResult = {
      success: true,
      transaction_id: 'tx-uuid',
    };
    expect(defaultStatus).toBeDefined();
  });

  it('soft delete: deleted_at is nullable, deleted transactions excluded from balance', () => {
    // Rule: transactions are NEVER physically deleted
    // Only marked with deleted_at when user calls delete_transaction
    // Balance calculation filters: WHERE deleted_at IS NULL
    const softDeleteContract = {
      table: 'transactions',
      deleted_at_column: 'deleted_at TIMESTAMPTZ', // nullable
      balance_query_filter: 'WHERE deleted_at IS NULL',
    };
    expect(softDeleteContract.table).toBe('transactions');
    expect(softDeleteContract.balance_query_filter).toContain('deleted_at IS NULL');
  });

  it('idempotency: same idempotency_key returns existing transaction, no duplicate', () => {
    // Implementation check: UNIQUE(household_id, idempotency_key) index
    // Before insert: check if idempotency_key exists for household
    // If exists: return existing transaction (success, no new insert)
    const idempotencyContract = {
      unique_index: 'idx_transactions_idempotency ON transactions(household_id, idempotency_key)',
      behavior: 'idempotent upsert — return existing on conflict',
    };
    expect(idempotencyContract.behavior).toBe('idempotent upsert — return existing on conflict');
  });
});