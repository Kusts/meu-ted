/**
 * cancel_pending_operation — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cancelPendingOperation } from './cancel_pending_operation';
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

describe('cancel_pending_operation runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 2 calls: existing check, update (mark cancelled)
  it('cancels pending operation', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'op-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'op-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await cancelPendingOperation('550e8400-e29b-41d4-a716-446655440001');

    expect(result.success).toBe(true);
    expect(result.operation_id).toBe('op-id');
  });

  it('rejects when no pending operation', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await cancelPendingOperation('550e8400-e29b-41d4-a716-446655440001');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No pending operation');
  });

  it('rejects invalid chat_id UUID', async () => {
    const result = await cancelPendingOperation('not-a-uuid');

    expect(result.success).toBe(false);
  });
});