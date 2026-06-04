/**
 * update_category — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateCategory } from './update_category';
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

describe('update_category runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 3 calls: existing check, name conflict check, update
  it('updates category name', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await updateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      'Alimentação',
      'expense',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.category_id).toBe('cat-id');
  });

  it('rejects non-existent category', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await updateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      'Nova Categoria',
      'expense',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects duplicate name for same kind', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'other-id' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await updateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      'Existente',
      'expense',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects invalid kind value', async () => {
    const result = await updateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      'Categoria',
      'transfer' as any,
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('must be one of');
  });

  it('rejects empty name', async () => {
    const result = await updateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      '',
      'expense',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects invalid category_id UUID', async () => {
    const result = await updateCategory(
      'not-a-uuid',
      'Categoria',
      'expense',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
  });

  it('allows same name with different kind', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await updateCategory(
      '550e8400-e29b-41d4-a716-446655440001',
      'Mesma Categoria',
      'income',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
  });
});