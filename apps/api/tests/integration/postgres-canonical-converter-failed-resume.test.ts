/**
 * FINDING-4 integration: a rerun over a `failed` (or partial) conversion
 * state refuses with a restore orientation — RESTORE the backup and
 * restart from zero — never with a generic assertion and never by
 * resuming over partial writes.
 *
 * PG-gated (DATABASE_URL_TEST + DB_TEST_MARKER). Dedicated throwaway
 * DATABASE, dropped in afterAll. No migrations needed: the refusal
 * happens before any plan/collect phase.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { ConversionError, runCanonicalConversion } from '../../src/scripts/canonical-converter/convert.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log('[postgres-canonical-converter-failed-resume] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER required.');
}

const DB_NAME = `pi_converter_fail_${process.pid}`;
const BACKUP_ID = `test-backup-fail-${randomUUID()}`;

let adminPool: Pool | undefined;
let db: Pool | undefined;

describeIfDb('Postgres canonical converter failed resume (FINDING-4)', () => {
  beforeAll(async () => {
    adminPool = createPool({ connectionString: DB_URL!, max: 2 });
    await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
    const url = new URL(DB_URL!);
    url.pathname = `/${DB_NAME}`;
    db = createPool({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: 60_000 });
    let connected = false;
    for (let attempt = 0; attempt < 12 && !connected; attempt++) {
      try {
        await db.query('SELECT 1');
        connected = true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
    if (!connected) throw new Error('dedicated converter database never accepted connections');
    await db.query(`CREATE TABLE _test_marker (marker_value TEXT NOT NULL)`);
    await db.query(`INSERT INTO _test_marker (marker_value) VALUES ($1)`, [process.env.DB_TEST_MARKER!]);
    await requireTestDatabase(db, 'converter-failed-fixture');
    await db.query(
      `CREATE TABLE _conversion_marker (
        id SERIAL PRIMARY KEY,
        backup_id TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ,
        state TEXT NOT NULL,
        plan_fingerprint TEXT NOT NULL DEFAULT '',
        summary JSONB,
        phase TEXT,
        "error" TEXT
      )`,
    );
    process.env.BACKUP_CONFIRMED = 'true';
    process.env.BACKUP_ID = BACKUP_ID;
  }, 180_000);

  afterAll(async () => {
    await db?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`).catch(() => undefined);
    await adminPool?.end();
  }, 120_000);

  it('refuses a rerun over a failed marker with a restore orientation', async () => {
    await db!.query(
      `INSERT INTO _conversion_marker (backup_id, finished_at, state, plan_fingerprint, phase, "error")
       VALUES ($1, NOW(), 'failed', 'abc', 'import:transactions', 'duplicate key')`,
      [BACKUP_ID],
    );
    const failure = await runCanonicalConversion(db!).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ConversionError);
    const message = (failure as Error).message;
    expect(message).toMatch(/RESTAURE/i);
    expect(message).toMatch(/import:transactions/);
    expect(message).toMatch(/duplicate key/);
    expect(message).not.toMatch(/AssertionError/);
    await db!.query(`DELETE FROM _conversion_marker`);
  }, 60_000);

  it('refuses a rerun over a legacy partial state with the same orientation', async () => {
    await db!.query(
      `INSERT INTO _conversion_marker (backup_id, state, plan_fingerprint) VALUES ($1, 'bootstrap_started', '')`,
      [BACKUP_ID],
    );
    await expect(runCanonicalConversion(db!)).rejects.toThrow(/RESTAURE/i);
    await db!.query(`DELETE FROM _conversion_marker`);
  }, 60_000);
});
