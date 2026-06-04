/**
 * deactivate_account — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deactivateAccount } from './deactivate_account';
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

describe('deactivate_account runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 3 calls: existing check, transaction count check, update
  it('deactivates account with no transactions', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await deactivateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.account_id).toBe('acc-id');
  });

  it('rejects non-existent account', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await deactivateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects account with transactions', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ cnt: '5' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await deactivateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('transactions');
  });

  it('rejects already deactivated account', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await deactivateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects invalid account_id UUID', async () => {
    const result = await deactivateAccount('not-a-uuid', '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(false);
  });

  it('rejects zero transaction count as valid (allows deactivation)', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await deactivateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
  });
});