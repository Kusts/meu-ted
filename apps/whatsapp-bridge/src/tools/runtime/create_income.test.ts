/**
 * create_income — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIncome } from './create_income';
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

describe('create_income runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // No idempotency key → 3 calls: category, account, insert
  it('creates income transaction', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any);

    const result = await createIncome(
      'Salário', 500000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('tx-id');
  });

  it('inserts with kind=income', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any);

    await createIncome(
      'Salário', 500000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    const insertCall = vi.mocked(query).mock.calls[2]!;
    expect(insertCall[0]).toContain("'income'");
  });

  it('rejects zero amount_cents', async () => {
    const result = await createIncome(
      'Test', 0,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('positive');
  });

  // 1 call: category check returns empty
  it('rejects non-existent category', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await createIncome(
      'Test', 1000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Category');
  });

  // 2 calls: category exists, account not found
  it('rejects non-existent account', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await createIncome(
      'Test', 1000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Account');
  });

  // 1 call: idempotency check returns existing
  it('returns existing for duplicate idempotency_key', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await createIncome(
      'Salário', 500000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099',
      undefined,
      'dup-key'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('existing-id');
  });
});