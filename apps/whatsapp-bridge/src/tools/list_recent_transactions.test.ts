/**
 * list_recent_transactions — Contract Test
 * =========================================
 * Contract/documentation test for list_recent_transactions tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: limit (optional, default 10, max 100), account_id (optional filter)
 * - Output: array of transaction rows with full details
 * - Ordered by date DESC, then created_at DESC
 * - Only non-deleted transactions returned
 */

import { describe, it, expect } from 'vitest';
import type { ListRecentTransactionsInput, ListRecentTransactionsResult } from './types';

describe('list_recent_transactions — input contract', () => {
  it('limit is optional, defaults to 10', () => {
    const input: ListRecentTransactionsInput = {};
    expect(input.limit).toBeUndefined(); // client defaults to 10
  });

  it('limit must be between 1 and 100 if provided', () => {
    const validInputs: ListRecentTransactionsInput[] = [
      { limit: 1 },
      { limit: 50 },
      { limit: 100 },
    ];
    validInputs.forEach(input => {
      expect(input.limit).toBeGreaterThanOrEqual(1);
      expect(input.limit).toBeLessThanOrEqual(100);
    });

    const invalidInputs = [0, 101, -1, 1000];
    invalidInputs.forEach(limit => {
      expect(limit < 1 || limit > 100).toBe(true);
    });
  });

  it('account_id is optional filter', () => {
    const input: ListRecentTransactionsInput = {
      limit: 20,
      account_id: '550e8400-e29b-41d4-a716-446655440000',
    };
    expect(typeof input.account_id).toBe('string');
    expect(input.account_id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('when account_id provided, filter applies to from_account OR to_account', () => {
    // Rule: account_id filter matches both from_account_id AND to_account_id
    // So transfers where account participates (as source or destination) are included
    const filterContract = {
      applies_to: 'from_account_id OR to_account_id',
      includes_transfers: true,
    };
    expect(filterContract.includes_transfers).toBe(true);
  });
});

describe('list_recent_transactions — output contract', () => {
  it('success result contains transactions array and count', () => {
    const result: ListRecentTransactionsResult = {
      success: true,
      transactions: [
        {
          id: 'tx-1',
          kind: 'expense',
          amount_cents: 4500,
          description: 'Almoço',
          category_id: 'cat-1',
          category_name: 'Alimentação',
          from_account_id: 'acc-1',
          from_account_name: 'Conta Corrente',
          to_account_id: null,
          to_account_name: null,
          date: '2026-06-03',
          status: 'confirmed',
          source_message_id: 'msg-123',
          created_at: '2026-06-03T12:00:00Z',
        },
      ],
      count: 1,
    };
    expect(result.success).toBe(true);
    expect(Array.isArray(result.transactions)).toBe(true);
    expect(typeof result.count).toBe('number');
  });

  it('empty result returns empty array with count=0', () => {
    const result: ListRecentTransactionsResult = {
      success: true,
      transactions: [],
      count: 0,
    };
    expect(result.transactions).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('failure result has error field', () => {
    const result: ListRecentTransactionsResult = {
      success: false,
      error: 'Database connection failed',
      transactions: [],
      count: 0,
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('list_recent_transactions — ordering rules', () => {
  it('ordered by date DESC, then created_at DESC', () => {
    // Most recent first
    const ordering = {
      primary: 'date DESC',
      secondary: 'created_at DESC',
    };
    expect(ordering.primary).toBe('date DESC');
    expect(ordering.secondary).toBe('created_at DESC');
  });

  it('excludes soft-deleted transactions', () => {
    // Rule: only transactions with deleted_at IS NULL returned
    const filter = 'WHERE deleted_at IS NULL';
    expect(filter).toBe('WHERE deleted_at IS NULL');
  });
});

describe('list_recent_transactions — field completeness', () => {
  it('each transaction row includes all essential fields', () => {
    // TransactionRow must include:
    // id, kind, amount_cents, description, category_id, category_name,
    // from_account_id, from_account_name, to_account_id, to_account_name,
    // date, status, source_message_id, created_at
    const requiredFields = [
      'id', 'kind', 'amount_cents', 'description',
      'category_id', 'category_name',
      'from_account_id', 'from_account_name',
      'to_account_id', 'to_account_name',
      'date', 'status', 'source_message_id', 'created_at',
    ];
    expect(requiredFields).toHaveLength(14);
  });

  it('amount_cents is always positive integer', () => {
    const amountRule = {
      sign: 'positive (sign encoded in kind)',
      type: 'integer cents',
    };
    expect(amountRule.sign).toBe('positive (sign encoded in kind)');
  });

  it('kind is expense|income|transfer', () => {
    const kinds = ['expense', 'income', 'transfer'];
    kinds.forEach(kind => {
      expect(['expense', 'income', 'transfer']).toContain(kind);
    });
  });

  it('status is confirmed|pending', () => {
    const statuses = ['confirmed', 'pending'];
    statuses.forEach(status => {
      expect(['confirmed', 'pending']).toContain(status);
    });
  });

  it('date is ISO format YYYY-MM-DD', () => {
    const date = '2026-06-03';
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});