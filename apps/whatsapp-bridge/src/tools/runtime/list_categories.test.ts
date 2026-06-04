/**
 * list_categories — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listCategories } from './list_categories';
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

describe('list_categories runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns categories for household', async () => {
    vi.mocked(query).mockResolvedValue({
      rows: [
        { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Alimentação', kind: 'expense', active: true },
        { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Salário', kind: 'income', active: true },
      ],
      command: 'SELECT',
      rowCount: 2,
    } as any);

    const result = await listCategories('550e8400-e29b-41d4-a716-446655440003');

    expect(result.success).toBe(true);
    expect(result.categories).toHaveLength(2);
    expect(result.categories[0].kind).toBe('expense');
    expect(result.categories[1].kind).toBe('income');
  });

  it('filters active categories only', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await listCategories('550e8400-e29b-41d4-a716-446655440004');

    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('active = true'),
      ['550e8400-e29b-41d4-a716-446655440004']
    );
  });

  it('excludes soft-deleted categories', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await listCategories('550e8400-e29b-41d4-a716-446655440005');

    expect(vi.mocked(query)).toHaveBeenCalledWith(
      expect.stringContaining('deleted_at IS NULL'),
      ['550e8400-e29b-41d4-a716-446655440005']
    );
  });

  it('returns error on database failure', async () => {
    vi.mocked(query).mockRejectedValue(new Error('DB connection failed'));

    const result = await listCategories('550e8400-e29b-41d4-a716-446655440006');

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB connection failed');
  });
});