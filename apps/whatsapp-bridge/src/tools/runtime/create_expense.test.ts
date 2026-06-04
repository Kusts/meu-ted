/**
 * create_expense — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createExpense } from './create_expense';
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

describe('create_expense runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // No idempotency key → call sequence: category exists, account exists, insert
  it('creates expense transaction', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any);

    const result = await createExpense(
      'Almoço', 4500,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('tx-id');
  });

  // 3 calls total: category, account, insert. Insert is at index 2.
  it('inserts with kind=expense', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any);

    await createExpense(
      'Almoço', 4500,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    const insertCall = vi.mocked(query).mock.calls[2]!;
    expect(insertCall[0]).toContain("'expense'");
  });

  // With idempotency key → 1 call: existing transaction
  it('returns existing transaction for duplicate idempotency_key', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'existing-tx-id' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await createExpense(
      'Almoço', 4500,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099',
      undefined,
      'idempotency-key-123'
    );

    expect(result.success).toBe(true);
    expect(result.transaction_id).toBe('existing-tx-id');
  });

  it('rejects zero amount_cents', async () => {
    const result = await createExpense(
      'Test', 0,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('positive');
  });

  // No idempotency key + no idempotency check → 1 call: category check returns empty
  it('rejects non-existent category', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await createExpense(
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

    const result = await createExpense(
      'Test', 1000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Account');
  });

  it('rejects invalid date format', async () => {
    const result = await createExpense(
      'Test', 1000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '06-03-2026',
      '550e8400-e29b-41d4-a716-446655440099'
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('YYYY-MM-DD');
  });

  it('rejects empty description', async () => {
    const result = await createExpense(
      '', 1000,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099'
    );
    expect(result.success).toBe(false);
  });

  // 3 calls: category, account, insert. source_message_id is at params[7] of insert.
  it('passes source_message_id to insert', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any);

    await createExpense(
      'Almoço', 4500,
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440002',
      '2026-06-03',
      '550e8400-e29b-41d4-a716-446655440099',
      'msg-123'
    );

    const insertCall = vi.mocked(query).mock.calls[2]!;
    expect(insertCall[1]).toContain('msg-123');
  });
});