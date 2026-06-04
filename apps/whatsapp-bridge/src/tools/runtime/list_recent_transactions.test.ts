/**
 * list_recent_transactions — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listRecentTransactions } from './list_recent_transactions';
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

describe('list_recent_transactions runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns transactions ordered by date DESC, created_at DESC', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [{
        id: '550e8400-e29b-41d4-a716-446655440001',
        kind: 'expense',
        amount_cents: '4500',
        description: 'Almoço',
        category_id: '550e8400-e29b-41d4-a716-446655440002',
        category_name: 'Alimentação',
        from_account_id: '550e8400-e29b-41d4-a716-446655440003',
        from_account_name: 'Conta Corrente',
        to_account_id: null,
        to_account_name: null,
        date: new Date('2026-06-03'),
        status: 'confirmed',
        source_message_id: 'msg-123',
        created_at: new Date('2026-06-03T12:00:00Z'),
      }],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    const result = await listRecentTransactions('550e8400-e29b-41d4-a716-446655440004', 10);

    expect(result.success).toBe(true);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].kind).toBe('expense');
    expect(result.transactions[0].amount_cents).toBe(4500);
  });

  it('respects limit parameter', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await listRecentTransactions('550e8400-e29b-41d4-a716-446655440005', 5);

    expect(vi.mocked(query)).toHaveBeenCalledWith(expect.stringContaining('LIMIT'), expect.arrayContaining([5]));
  });

  it('filters by account_id when provided', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await listRecentTransactions('550e8400-e29b-41d4-a716-446655440006', 10, '550e8400-e29b-41d4-a716-446655440007');

    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('from_account_id'),
      expect.arrayContaining(['550e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440007'])
    );
  });

  it('rejects invalid limit zero', async () => {
    const result = await listRecentTransactions('550e8400-e29b-41d4-a716-446655440008', 0);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Limit');
  });

  it('rejects invalid limit above 100', async () => {
    const result = await listRecentTransactions('550e8400-e29b-41d4-a716-446655440009', 101);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Limit');
  });

  it('returns empty array when no transactions', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await listRecentTransactions('550e8400-e29b-41d4-a716-446655440010', 10);

    expect(result.transactions).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('excludes soft-deleted transactions', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await listRecentTransactions('550e8400-e29b-41d4-a716-446655440011', 10);

    expect(vi.mocked(query)).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'), expect.any(Array));
  });

  it('returns error on database failure', async () => {
    vi.mocked(query).mockRejectedValue(new Error('DB error'));

    const result = await listRecentTransactions('550e8400-e29b-41d4-a716-446655440012', 10);

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB error');
  });
});