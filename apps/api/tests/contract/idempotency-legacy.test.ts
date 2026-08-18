import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPostgresIdempotencyStore } from '../../src/writes/postgres.js';

describe('G2 — legacy idempotency audit boundary', () => {
  it('writes the operation record and legacy audit row in one transaction', async () => {
    const sql: string[] = [];
    const client = {
      async query(text: string) {
        sql.push(text);
        if (text.includes('INSERT INTO operation_records')) return { rowCount: 1, rows: [{ id: '00000000-0000-4000-8000-000000000001' }] };
        return { rowCount: 1, rows: [] };
      },
      release() {},
    };
    const pool = { connect: async () => client } as unknown as Pool;

    const result = await createPostgresIdempotencyStore({ pool, legacy: true }).lookupOrRecord(
      { workspaceId: '00000000-0000-4000-8000-0000000000a1', actorType: 'device', actorId: 'device-1', operation: 'accounts.create', key: 'k1' },
      { name: 'Conta' },
      async () => ({ accountId: '00000000-0000-4000-8000-000000000002' }),
    );

    expect(result.replayed).toBe(false);
    const auditInsert = sql.find((statement) => statement.includes('INSERT INTO audit_logs'));
    expect(auditInsert).toContain('household_id');
    expect(auditInsert).toContain('before_json');
    expect(auditInsert).toContain('after_json');
    expect(auditInsert).not.toContain('operation_record_id');
  });
});
