/**
 * deactivate_category — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deactivateCategory } from './deactivate_category';
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

describe('deactivate_category runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 3 calls: existing check, transaction count check, update
  it('deactivates category with no transactions', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await deactivateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.category_id).toBe('cat-id');
  });

  it('rejects non-existent category', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await deactivateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects category with transactions', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ cnt: '10' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await deactivateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('transactions');
  });

  it('rejects already deactivated category', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await deactivateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects invalid category_id UUID', async () => {
    const result = await deactivateCategory('not-a-uuid', '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(false);
  });

  it('allows deactivation with zero transactions', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ cnt: '0' }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await deactivateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
  });
});