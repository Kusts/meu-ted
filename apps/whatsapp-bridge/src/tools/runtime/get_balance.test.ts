/**
 * get_balance — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBalance } from './get_balance';
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

describe('get_balance runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates balance correctly', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', name: 'Conta', initial_balance_cents: '100000' }],
        command: 'SELECT',
        rowCount: 1,
      } as any)
      .mockResolvedValueOnce({
        rows: [{ income_sum: '50000', expense_sum: '30000', transfer_out: '10000', transfer_in: '5000' }],
        command: 'SELECT',
        rowCount: 1,
      } as any);

    const result = await getBalance('550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002');

    expect(result.success).toBe(true);
    expect(result.calculated_balance_cents).toBe(115000);
  });

  it('returns account name and initial balance', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440003', name: 'Poupança', initial_balance_cents: '200000' }],
        command: 'SELECT',
        rowCount: 1,
      } as any)
      .mockResolvedValueOnce({
        rows: [{ income_sum: '0', expense_sum: '0', transfer_out: '0', transfer_in: '0' }],
        command: 'SELECT',
        rowCount: 1,
      } as any);

    const result = await getBalance('550e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440004');

    expect(result.account_name).toBe('Poupança');
    expect(result.initial_balance_cents).toBe(200000);
  });

  it('allows negative balance (debt scenario)', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440005', name: 'Cartão', initial_balance_cents: '-200000' }],
        command: 'SELECT',
        rowCount: 1,
      } as any)
      .mockResolvedValueOnce({
        rows: [{ income_sum: '0', expense_sum: '100000', transfer_out: '0', transfer_in: '0' }],
        command: 'SELECT',
        rowCount: 1,
      } as any);

    const result = await getBalance('550e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440006');

    expect(result.calculated_balance_cents).toBe(-300000);
  });

  it('returns error for non-existent account', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await getBalance('550e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440008');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('validates UUID format', async () => {
    const result = await getBalance('not-a-uuid', '550e8400-e29b-41d4-a716-446655440009');

    expect(result.success).toBe(false);
    expect(result.error).toContain('UUID');
  });

  it('excludes soft-deleted transactions from balance', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [{ id: '550e8400-e29b-41d4-a716-446655440010', name: 'Test', initial_balance_cents: '0' }],
        command: 'SELECT',
        rowCount: 1,
      } as any)
      .mockResolvedValueOnce({
        rows: [{ income_sum: '10000', expense_sum: '5000', transfer_out: '0', transfer_in: '0' }],
        command: 'SELECT',
        rowCount: 1,
      } as any);

    await getBalance('550e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440011');

    expect(vi.mocked(query)).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'), expect.any(Array));
  });
});