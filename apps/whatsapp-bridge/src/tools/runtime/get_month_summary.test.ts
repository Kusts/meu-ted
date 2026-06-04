/**
 * get_month_summary — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMonthSummary } from './get_month_summary';
import { query } from '../db';

vi.mock('../db.js', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
  withTransaction: vi.fn(),
  closePool: vi.fn(),
  isDatabaseHealthy: vi.fn(),
}));
vi.mock('pg', () => ({
  __esModule: true,
  default: { Pool: vi.fn(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() })) },
  Pool: vi.fn(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() })),
}));

describe('get_month_summary runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates monthly totals correctly', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ total_income: '500000', total_expense: '320000', transaction_count: '15' }],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    const result = await getMonthSummary('550e8400-e29b-41d4-a716-446655440001', 2026, 6);

    expect(result.success).toBe(true);
    expect(result.total_income_cents).toBe(500000);
    expect(result.total_expense_cents).toBe(320000);
    expect(result.net_balance_cents).toBe(180000);
    expect(result.transaction_count).toBe(15);
    expect(result.month).toBe('2026-06');
  });

  it('allows negative net balance', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ total_income: '100000', total_expense: '150000', transaction_count: '8' }],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    const result = await getMonthSummary('550e8400-e29b-41d4-a716-446655440002', 2026, 6);

    expect(result.net_balance_cents).toBe(-50000);
  });

  it('returns zero when no transactions', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ total_income: '0', total_expense: '0', transaction_count: '0' }],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    const result = await getMonthSummary('550e8400-e29b-41d4-a716-446655440003', 2026, 6);

    expect(result.total_income_cents).toBe(0);
    expect(result.total_expense_cents).toBe(0);
    expect(result.net_balance_cents).toBe(0);
    expect(result.transaction_count).toBe(0);
  });

  it('rejects invalid month', async () => {
    const result = await getMonthSummary('550e8400-e29b-41d4-a716-446655440004', 2026, 0);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Month');
  });

  it('rejects invalid month above 12', async () => {
    const result = await getMonthSummary('550e8400-e29b-41d4-a716-446655440005', 2026, 13);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Month');
  });

  it('rejects invalid year', async () => {
    const result = await getMonthSummary('550e8400-e29b-41d4-a716-446655440006', 1999, 6);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Year');
  });

  it('validates UUID', async () => {
    const result = await getMonthSummary('not-uuid', 2026, 6);
    expect(result.success).toBe(false);
  });

  it('excludes soft-deleted transactions', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{ total_income: '0', total_expense: '0', transaction_count: '0' }],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    await getMonthSummary('550e8400-e29b-41d4-a716-446655440007', 2026, 6);

    expect(vi.mocked(query)).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'), expect.any(Array));
  });
});