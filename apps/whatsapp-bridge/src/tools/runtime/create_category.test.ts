/**
 * create_category — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCategory } from './create_category';
import { query } from '../db';

vi.mock('pg', () => ({
  __esModule: true,
  default: { Pool: vi.fn(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() })) },
  Pool: vi.fn(() => ({ query: vi.fn(), connect: vi.fn(), end: vi.fn() })),
}));

vi.mock('../db.js', () => ({
  query: vi.fn(),
  getPool: vi.fn(),
  withTransaction: vi.fn(),
  closePool: vi.fn(),
  isDatabaseHealthy: vi.fn(),
}));

describe('create_category runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);
  });

  function setupSuccess() {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-id' }], command: 'INSERT', rowCount: 1 } as any);
  }

  it('creates expense category', async () => {
    setupSuccess();

    const result = await createCategory('Alimentação', 'expense', '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(true);
    expect(result.category_id).toBe('cat-id');
  });

  it('creates income category', async () => {
    setupSuccess();

    const result = await createCategory('Salário', 'income', '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(true);
    expect(result.category_id).toBe('cat-id');
  });

  it('inserts with active=true', async () => {
    setupSuccess();

    await createCategory('Alimentação', 'expense', '550e8400-e29b-41d4-a716-446655440099');

    const insertCall = vi.mocked(query).mock.calls.at(-1)!;
    expect(insertCall[0]).toContain('active');
  });

  it('rejects empty name', async () => {
    const result = await createCategory('', 'expense', '550e8400-e29b-41d4-a716-446655440099');
    expect(result.success).toBe(false);
  });

  it('rejects invalid kind', async () => {
    const result = await createCategory('Test', 'transfer' as any, '550e8400-e29b-41d4-a716-446655440099');
    expect(result.success).toBe(false);
    expect(result.error).toContain('kind');
  });

  it('rejects duplicate name+kind for household', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ id: 'existing-id' }],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    const result = await createCategory('Alimentação', 'expense', '550e8400-e29b-41d4-a716-446655440099');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects invalid household_id UUID', async () => {
    const result = await createCategory('Alimentação', 'expense', 'not-a-uuid');
    expect(result.success).toBe(false);
    expect(result.error).toContain('UUID');
  });

  it('trims whitespace from name', async () => {
    setupSuccess();

    await createCategory('  Alimentação  ', 'expense', '550e8400-e29b-41d4-a716-446655440099');

    const insertCall = vi.mocked(query).mock.calls.at(-1)!;
    expect(insertCall[1]).toContain('Alimentação');
  });
});