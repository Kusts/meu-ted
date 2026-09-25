import { describe, expect, it } from 'vitest';
import { resolveRerunAction } from '../../src/scripts/canonical-converter/archive-and-bootstrap.js';
import { auditCanonicalCount, buildFailedResumeMessage } from '../../src/scripts/canonical-converter/convert.js';

type Row = Record<string, unknown>;

const stubPool = (handler: (sql: string) => { rows: Row[] } | { fail: string }) => ({
  query: async (sql: string) => {
    const out = handler(sql);
    if ('fail' in out) {
      const error = new Error(out.fail) as Error & { code?: string };
      error.code = '42501';
      throw error;
    }
    return { rows: out.rows, rowCount: out.rows.length };
  },
});

describe('canonical converter failed-state resume guard (FINDING-4)', () => {
  it('refuses a rerun over a failed state orienting to restore the backup', () => {
    expect(() =>
      resolveRerunAction({
        marker: { backupId: 'b1', state: 'failed' },
        partial: true,
        backupId: 'b1',
      }),
    ).toThrow(/restaur/i);
  });

  it('builds a restore-oriented failure message carrying phase and cause', () => {
    const message = buildFailedResumeMessage('import:transactions', 'duplicate key', 'backup-123');
    expect(message).toMatch(/backup-123/);
    expect(message).toMatch(/import:transactions/);
    expect(message).toMatch(/duplicate key/);
    expect(message).toMatch(/restaur/i);
  });
});

describe('canonical converter audit count guard (FINDING-5)', () => {
  it('propagates query errors instead of swallowing them as zero', async () => {
    const pool = stubPool((sql) =>
      sql.includes('to_regclass')
        ? { rows: [{ missing: false }] }
        : { fail: 'permission denied for table audit_logs' },
    );
    await expect(auditCanonicalCount(pool as never, 'public')).rejects.toThrow(/permission denied/);
  });

  it('counts zero only when the catalog proves the table is absent', async () => {
    const pool = stubPool((sql) =>
      sql.includes('to_regclass') ? { rows: [{ missing: true }] } : { rows: [{ n: 99 }] },
    );
    await expect(auditCanonicalCount(pool as never, 'public')).resolves.toBe(0);
  });

  it('returns the real count when the table exists', async () => {
    const pool = stubPool((sql) =>
      sql.includes('to_regclass') ? { rows: [{ missing: false }] } : { rows: [{ n: 7 }] },
    );
    await expect(auditCanonicalCount(pool as never, 'public')).resolves.toBe(7);
  });
});
