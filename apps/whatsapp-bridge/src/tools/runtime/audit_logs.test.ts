/**
 * audit_logs — Runtime test (TDD)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditLogs } from './audit_logs';
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

describe('audit_logs runtime', () => {
  beforeEach(() => {
    vi.mocked(query).mockReset();
  });

  it('returns audit logs for household', async () => {
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        { id: 'log-1', household_id: 'hh-1', chat_id: 'c1', action: 'create', entity_type: 'transaction', entity_id: 'tx-1', details: {}, created_at: new Date() },
        { id: 'log-2', household_id: 'hh-1', chat_id: 'c1', action: 'delete', entity_type: 'transaction', entity_id: 'tx-2', details: {}, created_at: new Date() },
      ],
      command: 'SELECT', rowCount: 2,
    } as any);

    const result = await auditLogs('550e8400-e29b-41d4-a716-446655440099', 50);

    expect(result.success).toBe(true);
    expect(result.logs).toHaveLength(2);
    expect(result.count).toBe(2);
  });

  it('returns empty logs when none exist', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    const result = await auditLogs('550e8400-e29b-41d4-a716-446655440099', 50);

    expect(result.success).toBe(true);
    expect(result.logs).toHaveLength(0);
    expect(result.count).toBe(0);
  });

  it('rejects invalid household_id UUID', async () => {
    const result = await auditLogs('not-a-uuid', 50);

    expect(result.success).toBe(false);
    expect(result.error).toContain('UUID');
  });

  it('caps limit at 100', async () => {
    vi.mocked(query).mockResolvedValueOnce({ rows: [], command: 'SELECT', rowCount: 0 } as any);

    await auditLogs('550e8400-e29b-41d4-a716-446655440099', 500);

    const call = vi.mocked(query).mock.calls[0]!;
    expect(call[1]).toContain(100); // limit capped
  });
});