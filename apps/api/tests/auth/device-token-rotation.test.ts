import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInMemoryDeviceTokenStore,
  createPostgresDeviceTokenStore,
  hashDeviceToken,
} from '../../src/auth/device-token.js';

const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';

const sha256hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** Minimal pool mock that runs `withTransaction` bodies against a handler. */
const mockTxPool = (handler: (sql: string, args: unknown[]) => Promise<{ rowCount: number; rows: Array<Record<string, unknown>> }>) => {
  const txCalls: Array<{ sql: string; args: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, args: unknown[] = []) => {
      txCalls.push({ sql, args });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rowCount: 0, rows: [] };
      return handler(sql, args);
    }),
    release: vi.fn(),
  };
  const pool = { query: vi.fn(), connect: vi.fn(async () => client) };
  return { pool, client, txCalls };
};

afterEach(() => {
  delete process.env.DEVICE_ROTATION_WINDOW_HOURS;
});

describe('T2.5 RED — postgres rotation store (SPEC §9 C4/C5)', () => {
  it('rotate resolves the predecessor scoped, inserts the hashed successor, windows the predecessor', async () => {
    const { pool, txCalls } = mockTxPool(async (sql) => {
      if (sql.startsWith('SELECT')) {
        return { rowCount: 1, rows: [{ device_id: 'dev-old', household_id: HOUSEHOLD_ID, expires_at: null, legacy: false }] };
      }
      return { rowCount: 1, rows: [] };
    });
    const store = createPostgresDeviceTokenStore(pool as never);

    const created = await store.rotate('old-raw-token', 'phone v2', HOUSEHOLD_ID);

    expect(typeof created.token).toBe('string');
    expect(created.householdId).toBe(HOUSEHOLD_ID);

    // The whole rotation runs in one transaction.
    const sqls = txCalls.map((c) => c.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');

    // Predecessor lookup is scoped by household (C5) and locks the row.
    const select = txCalls.find((c) => c.sql.startsWith('SELECT'))!;
    expect(select.sql).toMatch(/FOR UPDATE/);
    expect(select.sql).toMatch(/household_id\s*=\s*\$\d/);
    expect(select.args).toEqual([sha256hex('old-raw-token'), HOUSEHOLD_ID]);

    // Successor INSERT persists the hash, never the raw secret.
    const insert = txCalls.find((c) => c.sql.startsWith('INSERT'))!;
    expect(insert.sql).toMatch(/token_hash/);
    expect(insert.args).not.toContain(created.token);
    expect(insert.args).toContain(sha256hex(created.token));

    // Predecessor UPDATE sets expires_at ≈ now + 24h default window, scoped.
    const updates = txCalls.filter((c) => c.sql.startsWith('UPDATE device_tokens SET expires_at'));
    expect(updates.length).toBe(1);
    for (const u of updates) {
      expect(u.sql).toMatch(/household_id\s*=\s*\$\d/);
      expect(u.args).toContain(HOUSEHOLD_ID);
      const deadline = new Date(u.args.find((a) => typeof a === 'string' && a.includes('T')) as string).getTime();
      const expected = Date.now() + 24 * 3_600_000;
      expect(Math.abs(deadline - expected)).toBeLessThan(60_000);
    }

    // No tautological scope anywhere (C5 contract).
    for (const c of txCalls) {
      expect(c.sql).not.toMatch(/household_id\s*=\s*household_id/);
    }
  });

  it('rotate without a predecessor (session path) only inserts, never windows', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    const created = await store.rotate(undefined, 'session phone', HOUSEHOLD_ID, { userId: 'user-1' });

    expect(typeof created.token).toBe('string');
    expect(query).toHaveBeenCalledOnce();
    const [sql, args] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/INSERT INTO device_tokens/);
    expect(args).not.toContain(created.token);
    expect(args).toContain('user-1');
  });

  it('honors DEVICE_ROTATION_WINDOW_HOURS for the predecessor deadline', async () => {
    process.env.DEVICE_ROTATION_WINDOW_HOURS = '48';
    const { pool, txCalls } = mockTxPool(async (sql) => {
      if (sql.startsWith('SELECT')) {
        return { rowCount: 1, rows: [{ device_id: 'dev-old', household_id: HOUSEHOLD_ID, expires_at: null, legacy: false }] };
      }
      return { rowCount: 1, rows: [] };
    });
    const store = createPostgresDeviceTokenStore(pool as never);

    await store.rotate('old-raw-token', 'phone', HOUSEHOLD_ID);

    const updates = txCalls.filter((c) => c.sql.startsWith('UPDATE device_tokens SET expires_at'));
    expect(updates.length).toBe(1);
    for (const u of updates) {
      const deadline = new Date(u.args.find((a) => typeof a === 'string' && (a as string).includes('T')) as string).getTime();
      expect(Math.abs(deadline - (Date.now() + 48 * 3_600_000))).toBeLessThan(60_000);
    }
  });

  it('rotate rejects when the predecessor is expired and never inserts (no resurrection)', async () => {
    const { pool, txCalls } = mockTxPool(async (sql) => {
      if (sql.startsWith('SELECT')) {
        return {
          rowCount: 1,
          rows: [{ device_id: 'dev-old', household_id: HOUSEHOLD_ID, expires_at: new Date(Date.now() - 1000).toISOString(), legacy: false }],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const store = createPostgresDeviceTokenStore(pool as never);

    await expect(store.rotate('expired-old', 'phone', HOUSEHOLD_ID)).rejects.toMatchObject({ code: 'auth.invalid_token' });
    expect(txCalls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
    expect(txCalls.map((c) => c.sql)).toContain('ROLLBACK');
  });

  it('resolve touches last_used_at on the hashed lookup path', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ device_id: 'dev-1', household_id: HOUSEHOLD_ID, expires_at: null }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await store.resolve('presented-header', HOUSEHOLD_ID);

    const touch = query.mock.calls[1] as [string, unknown[]];
    expect(touch[0]).toMatch(/last_used_at/);
    expect(touch[0]).toMatch(/household_id\s*=\s*\$\d/);
    expect(touch[1]).toEqual([sha256hex('presented-header'), HOUSEHOLD_ID]);
  });

  it('lazy expiry: a predecessor past its rotation window rejects, the successor resolves', async () => {
    const newRaw = 'brand-new-token';
    const query = vi.fn(async (sql: string, args: unknown[]) => {
      if (sql.startsWith('SELECT')) {
        const [hash] = args as [string];
        if (hash === sha256hex(newRaw)) {
          return { rowCount: 1, rows: [{ device_id: 'dev-new', household_id: HOUSEHOLD_ID, expires_at: null }] };
        }
        // Simulated post-window row for the predecessor.
        return {
          rowCount: 1,
          rows: [{ device_id: 'dev-old', household_id: HOUSEHOLD_ID, expires_at: new Date(Date.now() - 1000).toISOString() }],
        };
      }
      return { rowCount: 1, rows: [] };
    });
    const store = createPostgresDeviceTokenStore({ query } as never);

    await expect(store.resolve('some-old-token')).rejects.toMatchObject({ code: 'auth.invalid_token' });
    await expect(store.resolve(newRaw)).resolves.toMatchObject({ deviceId: 'dev-new', householdId: HOUSEHOLD_ID });
  });

  it('new tokens hash with the shared SHA-256 helper (raw never leaves the response)', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });
    const store = createPostgresDeviceTokenStore({ query } as never);

    const created = await store.register('laptop', HOUSEHOLD_ID);
    expect(hashDeviceToken(created.token)).toBe(sha256hex(created.token));
    const [, args] = query.mock.calls[0] as [string, unknown[]];
    expect(args).not.toContain(created.token);
  });
});

describe('FIX-ROT RED — single-use predecessor (security review HIGH)', () => {
  it('in-memory: second rotate of the same predecessor rejects 409 without a successor', async () => {
    const store = createInMemoryDeviceTokenStore();
    const prev = await store.register('phone', HOUSEHOLD_ID);

    const first = await store.rotate(prev.token, 'phone v2', HOUSEHOLD_ID);
    expect(typeof first.token).toBe('string');

    await expect(store.rotate(prev.token, 'phone v3', HOUSEHOLD_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'auth.token_already_rotated',
    });
  });

  it('in-memory: concurrent rotates of the same predecessor yield exactly one successor', async () => {
    const store = createInMemoryDeviceTokenStore();
    const prev = await store.register('phone', HOUSEHOLD_ID);

    const settled = await Promise.allSettled([
      store.rotate(prev.token, 'a', HOUSEHOLD_ID),
      store.rotate(prev.token, 'b', HOUSEHOLD_ID),
    ]);
    const fulfilled = settled.filter((s) => s.status === 'fulfilled');
    const rejected = settled.filter((s) => s.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'auth.token_already_rotated' });
  });

  it('postgres: rotation locks the predecessor FOR UPDATE and commits successor + windowing in one transaction', async () => {
    const { pool, txCalls } = mockTxPool(async (sql) => {
      if (sql.startsWith('SELECT')) {
        return { rowCount: 1, rows: [{ device_id: 'dev-old', household_id: HOUSEHOLD_ID, expires_at: null, legacy: false }] };
      }
      return { rowCount: 1, rows: [] };
    });
    const store = createPostgresDeviceTokenStore(pool as never);

    const created = await store.rotate('old-raw-token', 'phone v2', HOUSEHOLD_ID);
    expect(typeof created.token).toBe('string');

    const sqls = txCalls.map((c) => c.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[sqls.length - 1]).toBe('COMMIT');

    const select = txCalls.find((c) => c.sql.startsWith('SELECT'))!;
    expect(select.sql).toMatch(/FOR UPDATE/);
    expect(select.sql).toMatch(/household_id\s*=\s*\$\d/);

    const insertIdx = sqls.findIndex((s) => s.startsWith('INSERT INTO device_tokens'));
    const updateIdx = sqls.findIndex((s) => s.startsWith('UPDATE device_tokens SET expires_at'));
    expect(insertIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    // Successor INSERT precedes predecessor windowing inside the same tx.
    expect(insertIdx).toBeLessThan(updateIdx);
  });

  it('postgres: second rotate of the same predecessor rejects 409 and never INSERTs', async () => {
    let predecessorExpiresAt: string | null = null;
    const { pool, txCalls } = mockTxPool(async (sql, args) => {
      if (sql.startsWith('SELECT')) {
        return { rowCount: 1, rows: [{ device_id: 'dev-old', household_id: HOUSEHOLD_ID, expires_at: predecessorExpiresAt, legacy: false }] };
      }
      if (sql.startsWith('UPDATE device_tokens SET expires_at')) {
        predecessorExpiresAt = args.find((a) => typeof a === 'string' && (a as string).includes('T')) as string;
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const store = createPostgresDeviceTokenStore(pool as never);

    await store.rotate('old-raw-token', 'phone v2', HOUSEHOLD_ID);
    const insertsBefore = txCalls.filter((c) => c.sql.startsWith('INSERT INTO device_tokens')).length;
    expect(insertsBefore).toBe(1);

    await expect(store.rotate('old-raw-token', 'phone v3', HOUSEHOLD_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'auth.token_already_rotated',
    });
    // No second successor row was created.
    expect(txCalls.filter((c) => c.sql.startsWith('INSERT INTO device_tokens'))).toHaveLength(1);
  });

  it('postgres: legacy predecessor rotates once, re-rotation rejects 409', async () => {
    // Legacy rows carry the V053 90-day backfill expiry: far-future expiry
    // means never-rotated (allowed once); a windowed expiry means consumed.
    let predecessorExpiresAt: string | null = new Date(Date.now() + 80 * 24 * 3_600_000).toISOString();
    const { pool, txCalls } = mockTxPool(async (sql, args) => {
      if (sql.includes('token_hash')) return { rowCount: 0, rows: [] };
      if (sql.startsWith('SELECT')) {
        return { rowCount: 1, rows: [{ device_id: 'dev-legacy', household_id: HOUSEHOLD_ID, expires_at: predecessorExpiresAt, legacy: true }] };
      }
      if (sql.startsWith('UPDATE device_tokens SET expires_at')) {
        predecessorExpiresAt = args.find((a) => typeof a === 'string' && (a as string).includes('T')) as string;
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });
    const store = createPostgresDeviceTokenStore(pool as never);

    const created = await store.rotate('legacy-raw-token', 'phone v2', HOUSEHOLD_ID);
    expect(typeof created.token).toBe('string');
    await expect(store.rotate('legacy-raw-token', 'phone v3', HOUSEHOLD_ID)).rejects.toMatchObject({
      statusCode: 409,
      code: 'auth.token_already_rotated',
    });
    expect(txCalls.filter((c) => c.sql.startsWith('INSERT INTO device_tokens'))).toHaveLength(1);
  });
});
