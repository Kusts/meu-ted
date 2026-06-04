/**
 * create_account — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAccount } from './create_account';
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

describe('create_account runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(query).mockResolvedValue({ rows: [], command: 'SELECT', rowCount: 0 } as any);
  });

  function setupSuccess() {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any) // no duplicate
      .mockResolvedValueOnce({ rows: [{ id: 'acc-id' }], command: 'INSERT', rowCount: 1 } as any);
  }

  it('creates account successfully', async () => {
    setupSuccess();

    const result = await createAccount('Conta Corrente', 100000, '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(true);
    expect(result.account_id).toBe('acc-id');
  });

  it('inserts with active=true', async () => {
    setupSuccess();

    await createAccount('Conta Corrente', 100000, '550e8400-e29b-41d4-a716-446655440099');

    const insertCall = vi.mocked(query).mock.calls.at(-1)!;
    expect(insertCall[0]).toContain('active');
    expect(insertCall[0]).toContain('true');
  });

  it('rejects empty name', async () => {
    const result = await createAccount('', 0, '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(false);
    expect(result.error).toContain('non-empty');
  });

  it('rejects non-integer initial_balance_cents', async () => {
    const result = await createAccount('Test', 1.5, '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(false);
    expect(result.error).toContain('integer');
  });

  it('allows negative initial_balance_cents (debt)', async () => {
    setupSuccess();

    const result = await createAccount('Cartão', -50000, '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(true);
  });

  it('rejects duplicate name for same household', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [{ id: 'existing-id' }],
      command: 'SELECT',
      rowCount: 1,
    } as any);

    const result = await createAccount('Conta Corrente', 0, '550e8400-e29b-41d4-a716-446655440099');

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('rejects invalid UUID for household_id', async () => {
    const result = await createAccount('Test', 0, 'not-a-uuid');

    expect(result.success).toBe(false);
    expect(result.error).toContain('UUID');
  });

  it('trims whitespace from name', async () => {
    setupSuccess();

    await createAccount('  Conta Corrente  ', 0, '550e8400-e29b-41d4-a716-446655440099');

    const insertCall = vi.mocked(query).mock.calls.at(-1)!;
    expect(insertCall[1]).toContain('Conta Corrente');
  });

  it('inserts initial_balance_cents as integer', async () => {
    setupSuccess();

    await createAccount('Test', 100000, '550e8400-e29b-41d4-a716-446655440099');

    const insertCall = vi.mocked(query).mock.calls.at(-1)!;
    expect(insertCall[1]).toContain(100000);
  });
});