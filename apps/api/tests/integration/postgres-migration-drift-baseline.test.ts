/**
 * Real-Postgres proof for the drift-guard baseline (deploy blocker).
 *
 * Runs only with DATABASE_URL_TEST + DB_TEST_MARKER; skips otherwise.
 * Reproduces the production incident on a real PostgreSQL:
 *  (a) legacy BYTEA checksum storage decoding to the manifest → boot goes on;
 *  (b) a genuinely edited pre-guard row (< V044) → structured WARN, boot
 *      goes on, pending migrations still apply;
 *  (c) a genuinely edited guarded-era row (V044+) → boot refuses;
 *  (d) legacy-mode boot applies pending V044–V047 in order, never V048.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import type { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

async function rewindRecent(db: Pool): Promise<void> {
  await db.query(`DROP INDEX IF EXISTS statements_household_account_cycle_uidx`);
  await db.query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx`);
  await db.query(`DELETE FROM _migrations WHERE version IN (44, 45, 46, 47, 48)`);
}

describe('Postgres drift baseline proof (deploy blocker)', () => {
  beforeAll(async () => {
    if (!DB_URL) return;
    pool = createPool({ connectionString: DB_URL, max: 4 });
    await requireTestDatabase(pool, 'migrate');
    await runMigrations(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase('legacy BYTEA checksum storage matching the manifest lets boot continue', async () => {
    const db = pool!;
    // Faithful production artifact: checksum stored as BYTEA, which
    // node-postgres surfaces as `\x...` hex strings.
    await db.query(`ALTER TABLE _migrations ALTER COLUMN checksum DROP DEFAULT`);
    await db.query(`ALTER TABLE _migrations ALTER COLUMN checksum TYPE BYTEA USING decode(checksum, 'hex')`);
    try {
      const result = await runMigrations(db);
      expect(result.applied).toEqual([]);
    } finally {
      await db.query(`ALTER TABLE _migrations ALTER COLUMN checksum TYPE TEXT USING encode(checksum, 'hex')`);
      await db.query(`ALTER TABLE _migrations ALTER COLUMN checksum SET DEFAULT ''`);
    }
    const check = await db.query(`SELECT data_type FROM information_schema.columns WHERE table_name = '_migrations' AND column_name = 'checksum'`);
    expect(check.rows[0]!['data_type']).toBe('text');
  }, 120_000);

  itIfDatabase('pre-guard real drift warns, boot continues, pending still apply', async () => {
    const db = pool!;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const v8before = await db.query(`SELECT checksum FROM _migrations WHERE version = 8`);
    expect(v8before.rowCount).toBe(1);
    const v8original = v8before.rows[0]!['checksum'] as string;
    try {
      await rewindRecent(db);
      await db.query(`UPDATE _migrations SET checksum = 'pre-guard-edit' WHERE version = 8`);
      const result = await runMigrations(db);
      for (const version of [44, 45, 46, 47, 48]) {
        expect(result.applied).toContain(version);
      }
      const warnings = warn.mock.calls.map((call) => String(call[0]));
      const baseline = warnings.filter((line) => line.includes('migration.baseline_drift'));
      expect(baseline.length).toBeGreaterThanOrEqual(1);
      expect(baseline.some((line) => line.includes('"version":8'))).toBe(true);
    } finally {
      vi.restoreAllMocks();
      await db.query(`UPDATE _migrations SET checksum = $1 WHERE version = 8`, [v8original]);
      await runMigrations(db).catch(() => undefined);
    }
  }, 180_000);

  itIfDatabase('guarded-era real drift refuses boot', async () => {
    const db = pool!;
    const before = await db.query(`SELECT checksum FROM _migrations WHERE version = 45`);
    expect(before.rowCount).toBe(1);
    const original = before.rows[0]!['checksum'] as string;
    await db.query(`UPDATE _migrations SET checksum = 'tampered' WHERE version = 45`);
    try {
      await expect(runMigrations(db)).rejects.toThrow(/migration drift detected/);
      await expect(runMigrations(db)).rejects.toThrow(/V045/);
    } finally {
      await db.query(`UPDATE _migrations SET checksum = $1 WHERE version = 45`, [original]);
    }
    const healed = await runMigrations(db);
    expect(healed.applied).toEqual([]);
  }, 120_000);

  itIfDatabase('legacy-mode boot applies pending V044–V047 in order, never V048', async () => {
    const db = pool!;
    await rewindRecent(db);
    // Exact VPS boot call (DB_SCHEMA=legacy).
    const result = await runMigrations(db, true);
    expect(result.applied).toEqual([44, 45, 46, 47]);
    const v48 = await db.query(`SELECT version FROM _migrations WHERE version = 48`);
    expect(v48.rowCount).toBe(0);
    await runMigrations(db);
  }, 180_000);
});
