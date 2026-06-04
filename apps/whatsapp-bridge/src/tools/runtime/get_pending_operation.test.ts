/**
 * get_pending_operation — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPendingOperation } from './get_pending_operation';
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

describe('get_pending_operation runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('returns pending operation when exists', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{
        id: 'op-id',
        chat_id: '550e8400-e29b-41d4-a716-446655440001',
        operation_type: 'create_expense',
        operation_data: { amount_cents: 5000 },
        expires_at: new Date('2026-06-03T23:59:59Z'),
        created_at: new Date('2026-06-03T18:00:00Z'),
      }],
      command: 'SELECT', rowCount: 1,
    } as any);

    const result = await getPendingOperation('550e8400-e29b-41d4-a716-446655440001');

    expect(result.success).toBe(true);
    expect(result.operation).toBeDefined();
    expect(result.operation!.id).toBe('op-id');
  });

  it('returns error when no pending operation', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await getPendingOperation('550e8400-e29b-41d4-a716-446655440001');

    expect(result.success).toBe(false);
    expect(result.error).toContain('No pending operation');
  });

  it('rejects invalid chat_id UUID', async () => {
    const result = await getPendingOperation('not-a-uuid');

    expect(result.success).toBe(false);
  });
});