/**
 * delete_transaction — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteTransaction } from './delete_transaction';
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

describe('delete_transaction runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 2 calls: existing check, update (soft delete)
  it('soft deletes transaction', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await deleteTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('tx-id');
  });

  it('rejects non-existent transaction', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await deleteTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects invalid transaction_id UUID', async () => {
    const result = await deleteTransaction(
      'not-a-uuid',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
  });

  it('rejects already deleted transaction', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await deleteTransaction(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});