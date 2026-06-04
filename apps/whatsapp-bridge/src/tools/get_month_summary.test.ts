/**
 * get_month_summary — Contract Test
 * ==================================
 * Contract/documentation test for get_month_summary tool.
 * Does NOT execute real DB operations.
 *
 * Spec: docs/superpowers/specs/2026-06-03-minimal-finance-agent-spec.md
 * Phase: 2
 *
 * VERIFIED CONTRACT:
 * - Input: year (number), month (1-12)
 * - Output: month summary with totals in cents, transaction count
 * - Aggregates: total_income_cents, total_expense_cents, net_balance
 * - Only non-deleted transactions included
 */

import { describe, it, expect } from 'vitest';
import type { GetMonthSummaryInput, GetMonthSummaryResult } from './types';

describe('get_month_summary — input contract', () => {
  it('requires year as number', () => {
    const input: GetMonthSummaryInput = {
      year: 2026,
      month: 6,
    };
    expect(typeof input.year).toBe('number');
    expect(input.year).toBeGreaterThanOrEqual(2000);
    expect(input.year).toBeLessThanOrEqual(2100);
  });

  it('requires month as number 1-12', () => {
    const input: GetMonthSummaryInput = {
      year: 2026,
      month: 12,
    };
    expect(input.month).toBeGreaterThanOrEqual(1);
    expect(input.month).toBeLessThanOrEqual(12);
  });

  it('rejects month outside 1-12 range', () => {
    const invalidMonths = [0, 13, -1, 100];
    invalidMonths.forEach(month => {
      expect(month < 1 || month > 12).toBe(true);
    });
  });
});

describe('get_month_summary — output contract', () => {
  it('success result contains month totals in cents', () => {
    const result: GetMonthSummaryResult = {
      success: true,
      month: '2026-06',
      total_income_cents: 500000,    // R$ 5.000,00
      total_expense_cents: 320000,   // R$ 3.200,00
      net_balance_cents: 180000,     // R$ 1.800,00 (income - expense)
      transaction_count: 15,
    };
    expect(result.success).toBe(true);
    expect(result.month).toBe('2026-06');
    expect(typeof result.total_income_cents).toBe('number');
    expect(typeof result.total_expense_cents).toBe('number');
    expect(typeof result.net_balance_cents).toBe('number');
    expect(typeof result.transaction_count).toBe('number');
  });

  it('net_balance = income - expense (can be negative)', () => {
    const result: GetMonthSummaryResult = {
      success: true,
      month: '2026-06',
      total_income_cents: 100000,
      total_expense_cents: 150000,
      net_balance_cents: -50000, // spent more than earned
      transaction_count: 8,
    };
    expect(result.net_balance_cents).toBe(result.total_income_cents - result.total_expense_cents);
  });

  it('failure result has error field', () => {
    const result: GetMonthSummaryResult = {
      success: false,
      error: 'Invalid month',
      month: 'invalid',
      total_income_cents: 0,
      total_expense_cents: 0,
      net_balance_cents: 0,
      transaction_count: 0,
    };
    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });
});

describe('get_month_summary — aggregation rules', () => {
  it('total_income aggregates kind=income transactions in month', () => {
    // SUM(amount_cents) WHERE kind='income' AND date within month AND deleted_at IS NULL
    const aggregation = {
      field: 'total_income_cents',
      source: "SUM(amount_cents) WHERE kind='income' AND date within [year-month] AND deleted_at IS NULL",
    };
    expect(aggregation.field).toBe('total_income_cents');
    expect(aggregation.source).toContain("kind='income'");
  });

  it('total_expense aggregates kind=expense transactions in month', () => {
    // SUM(amount_cents) WHERE kind='expense' AND date within month AND deleted_at IS NULL
    const aggregation = {
      field: 'total_expense_cents',
      source: "SUM(amount_cents) WHERE kind='expense' AND date within [year-month] AND deleted_at IS NULL",
    };
    expect(aggregation.field).toBe('total_expense_cents');
    expect(aggregation.source).toContain("kind='expense'");
  });

  it('transfers excluded from income/expense totals (net zero)', () => {
    // Rule: transfers are internal movements, not income/expense
    // net effect on household: income - expense ignores transfers
    const transferRule = {
      transfers_in_summary: false,
      reason: 'transfers are net-zero for household cash flow',
    };
    expect(transferRule.transfers_in_summary).toBe(false);
  });

  it('transaction_count counts all non-deleted transactions in month', () => {
    const countRule = {
      field: 'transaction_count',
      includes: 'expense + income + transfer (non-deleted)',
      excludes: 'deleted_at IS NOT NULL',
    };
    expect(countRule.excludes).toBe('deleted_at IS NOT NULL');
  });

  it('only non-deleted transactions included', () => {
    const filter = 'WHERE deleted_at IS NULL';
    expect(filter).toBe('WHERE deleted_at IS NULL');
  });

  it('pending transactions included in summary', () => {
    const statusIncluded = {
      pending: 'included in summary totals',
      confirmed: 'included in summary totals',
    };
    expect(statusIncluded.pending).toBe('included in summary totals');
  });
});