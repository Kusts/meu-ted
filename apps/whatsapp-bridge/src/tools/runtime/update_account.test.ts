/**
 * update_account — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateAccount } from './update_account';
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

describe('update_account runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  // 3 calls: existing check, name conflict check, update
  it('updates account name', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'UPDATE', rowCount: 1 } as any);

    const result = await updateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      'Nova Conta Corrente',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(true);
    expect(result.account_id).toBe('acc-id');
  });

  it('rejects non-existent account', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await updateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      'Nova Conta',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects already deactivated account', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ id: 'acc-id', active: false }], command: 'SELECT', rowCount: 1 } as any);

    const result = await updateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      'Nova Conta',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('not active');
  });

  it('rejects duplicate name in same household', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id', active: true }], command: 'SELECT', rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'other-id' }], command: 'SELECT', rowCount: 1 } as any);

    const result = await updateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      'Conta Existente',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects empty name', async () => {
    const result = await updateAccount(
      '550e8400-e29b-41d4-a716-446655440001',
      '',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('rejects invalid account_id UUID', async () => {
    const result = await updateAccount(
      'not-a-uuid',
      'Nova Conta',
      '550e8400-e29b-41d4-a716-446655440099'
    );

    expect(result.success).toBe(false);
  });
});