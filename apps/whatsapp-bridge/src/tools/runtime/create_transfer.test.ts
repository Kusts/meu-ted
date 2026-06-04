/**
 * create_transfer — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTransfer } from './create_transfer';
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

describe('create_transfer runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // No idempotency key → 2 calls: accounts check (2 rows), insert
  it('creates transfer transaction', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }], command: 'SELECT', rowCount: 2 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any);

    const result = await createTransfer(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      50000,
      'Transferência Poupança',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('tx-id');
  });

  it('inserts with kind=transfer', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'a' }, { id: 'b' }], command: 'SELECT', rowCount: 2 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any);

    await createTransfer(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      50000,
      'Transferência',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    const insertCall = vi.mocked(query).mock.calls[1]!;
    expect(insertCall[0]).toContain("'transfer'");
  });

  // Pre-validation: same ID blocked before any DB call
  it('rejects same from_account_id and to_account_id', async () => {
    const sameId = '550e8400-e29b-41d4-a716-446655440001';
    const result = await createTransfer(sameId, sameId, 50000, 'Test', '2026-06-03', '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(false);
    expect(result.error).toContain('must be different');
  });

  // 1 call: accounts check returns only 1 row (one account not found)
  it('rejects when one account not found', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'only-one' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await createTransfer(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      50000, 'Test', '2026-06-03', '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/account/i);
  });

  it('rejects zero amount_cents', async () => {
    const result = await createTransfer(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      0, 'Test', '2026-06-03', '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('positive');
  });

  it('rejects invalid date format', async () => {
    const result = await createTransfer(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      50000, 'Test', 'invalid-date', '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('YYYY-MM-DD');
  });

  // 1 call: idempotency check returns existing
  it('returns existing for duplicate idempotency_key', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'existing-id' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await createTransfer(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      50000, 'Transferência', '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099',
      undefined, 'dup-key'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('existing-id');
  });
});