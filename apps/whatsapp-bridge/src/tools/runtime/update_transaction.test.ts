/**
 * update_transaction — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateTransaction } from './update_transaction';
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

describe('update_transaction runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 2 calls: existing check, update
  it('updates transaction description', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id', kind: 'expense' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await updateTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      { description: 'Novo almoço' },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('tx-id');
  });

  it('rejects non-existent transaction', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await updateTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      { description: 'Test' },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects invalid category_id', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id', kind: 'expense' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await updateTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      { category_id: '550e8400-e29b-41d4-a716-446655440002' },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Category');
  });

  it('rejects invalid from_account_id', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id', kind: 'expense' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await updateTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      { from_account_id: '550e8400-e29b-41d4-a716-446655440002' },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Account');
  });

  it('rejects zero amount_cents', async () => {
    const result = await updateTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      { amount_cents: 0 },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('positive');
  });

  it('rejects invalid date format', async () => {
    const result = await updateTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      { date: '06-03-2026' },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('YYYY-MM-DD');
  });

  it('rejects empty description', async () => {
    const result = await updateTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      { description: '' },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects invalid transaction_id UUID', async () => {
    const result = await updateTransaction(
      'not-a-uuid',
      { description: 'Test' },
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
  });
});