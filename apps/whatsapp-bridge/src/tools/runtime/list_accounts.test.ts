/**
 * list_accounts — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listAccounts } from './list_accounts';
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

describe('list_accounts runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns accounts for household', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'Conta Corrente',
          initial_balance_cents: '100000',
          active: true,
          created_at: new Date('2026-06-01T10:00:00Z'),
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          name: 'Poupança',
          initial_balance_cents: '500000',
          active: true,
          created_at: new Date('2026-06-01T10:00:00Z'),
        },
      ],
      command: 'SELECT',
      rowCount: 2,
    } as any);

    const result = await listAccounts('550e8400-e29b-41d4-a716-446655440003');

    expect(result.success).toBe(true);
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0].name).toBe('Conta Corrente');
    expect(result.accounts[0].initial_balance_cents).toBe(100000);
  });

  it('returns empty array when no accounts', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await listAccounts('550e8400-e29b-41d4-a716-446655440004');

    expect(result.success).toBe(true);
    expect(result.accounts).toHaveLength(0);
  });

  it('returns error on database failure', async () => {
    vi.mocked(query).mockRejectedValue(new Error('DB connection failed'));

    const result = await listAccounts('550e8400-e29b-41d4-a716-446655440005');

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB connection failed');
    expect(result.accounts).toEqual([]);
  });

  it('converts BIGINT cents to number', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        {
          id: '550e8400-e29b-41d4-a716-446655440006',
          name: 'Test',
          initial_balance_cents: '999999999999',
          active: true,
          created_at: new Date(),
        },
      ],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    const result = await listAccounts('550e8400-e29b-41d4-a716-446655440007');

    expect(result.accounts[0].initial_balance_cents).toBe(999999999999);
    expect(typeof result.accounts[0].initial_balance_cents).toBe('number');
  });

  it('filters active accounts only', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await listAccounts('550e8400-e29b-41d4-a716-446655440008');

    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('active = true'),
      ['550e8400-e29b-41d4-a716-446655440008']
    );
  });

  it('excludes soft-deleted accounts', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await listAccounts('550e8400-e29b-41d4-a716-446655440009');

    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'),
      ['550e8400-e29b-41d4-a716-446655440009']
    );
  });
});