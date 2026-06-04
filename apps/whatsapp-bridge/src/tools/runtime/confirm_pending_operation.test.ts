/**
 * confirm_pending_operation — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { confirmPendingOperation } from './confirm_pending_operation';
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

describe('confirm_pending_operation runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 2 calls: fetch pending, insert transaction
  it('executes pending operation and creates transaction', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{
          id: 'op-id',
          kind: 'expense',
          amount_cents: 5000,
          description: 'Almoço',
          category_id: '550e8400-e29b-41d4-a716-446655440001',
          from_account_id: '550e8400-e29b-41d4-a716-446655440002',
          to_account_id: null,
          date: '2026-06-03',
        }],
        command: 'SELECT', rowCount: 1,
      } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-id' }], command: 'INSERT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], command: 'UPDATE', rowCount: 1 } as any);

    const result = await confirmPendingOperation(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.operation_id).toBe('op-id');
    expect(result.result?.transaction_id).toBe('tx-id');
  });

  it('rejects when no pending operation', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await confirmPendingOperation(
      'chat-123',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No pending operation');
  });

  it('rejects empty chat_id', async () => {
    const result = await confirmPendingOperation(
      '',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });
});