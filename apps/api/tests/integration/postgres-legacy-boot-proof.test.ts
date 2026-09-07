/**
 * Real-Postgres legacy boot proof (deploy blocker T2).
 *
 * Runs only with DATABASE_URL_TEST + DB_TEST_MARKER; skips otherwise.
 *
 * The VPS boots with DB_SCHEMA=legacy, so runMigrations(pool, true) only
 * applies LEGACY_SAFE_PREFIXES. This file proves on a real PostgreSQL:
 *  1. V044..V048 apply sequentially in version order (full mode);
 *  2. a legacy-mode boot right after is a no-op — V048 is never attempted;
 *  3. V048 genuinely cannot run on a legacy-shaped categories table
 *     (`active` boolean, no `status` column): it fails with a missing-column
 *     error inside a rolled-back transaction, which is exactly why V048
 *     stays out of LEGACY_SAFE_PREFIXES (see
 *     docs/ops/v048-legacy-boot-decision.md).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import type { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

const v048Sql = readFileSync(new URL('../../src/read-models/sql/V048__category_uniqueness.sql', import.meta.url), 'utf8');

describe('Postgres legacy boot proof (T2)', () => {
  beforeAll(async () => {
    if (!DB_URL) return;
    pool = createPool({ connectionString: DB_URL, max: 4 });
    await requireTestDatabase(pool, 'migrate');
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase('V044..V048 apply sequentially in version order', async () => {
    const db = pool!;
    // Start from a pre-V044 state so this test owns the 44..48 window even
    // when other files migrated this database before.
    await db.query(`DELETE FROM _migrations WHERE version IN (44, 45, 46, 47, 48)`).catch(() => undefined);
    await db.query(`DROP INDEX IF EXISTS statements_household_account_cycle_uidx`);
    await db.query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx`);
    const result = await runMigrations(db);
    for (const version of [44, 45, 46, 47, 48]) {
      expect(result.applied).toContain(version);
    }
    const rows = await db.query(`SELECT version FROM _migrations WHERE version IN (44, 45, 46, 47, 48) ORDER BY version`);
    expect(rows.rows.map((row) => row['version'])).toEqual([44, 45, 46, 47, 48]);
  }, 120_000);

  itIfDatabase('legacy-mode boot afterwards is a no-op: V048 is never attempted', async () => {
    const db = pool!;
    await runMigrations(db);
    // This is the exact call the VPS boot performs (DB_SCHEMA=legacy).
    const legacyBoot = await runMigrations(db, true);
    expect(legacyBoot.applied).toEqual([]);
    const v48 = await db.query(`SELECT version FROM _migrations WHERE version = 48`);
    expect(v48.rowCount).toBe(1);
  }, 120_000);

  itIfDatabase('V048 fails on a legacy-shaped categories table (no status column)', async () => {
    const db = pool!;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE SCHEMA probe_legacy');
      // Legacy shape: activity is an `active` boolean; there is no `status`.
      await client.query(
        `CREATE TABLE probe_legacy.categories (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           household_id UUID NOT NULL,
           name TEXT NOT NULL,
           kind TEXT NOT NULL,
           active BOOLEAN NOT NULL DEFAULT true,
           parent_id UUID,
           deleted_at TIMESTAMPTZ
         )`,
      );
      await client.query(
        `CREATE TABLE probe_legacy.transactions (
           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           household_id UUID NOT NULL,
           category_id UUID,
           subcategory_id UUID
         )`,
      );
      await client.query('SET LOCAL search_path = probe_legacy, public');
      await expect(client.query(v048Sql)).rejects.toThrow(/status/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const schemas = await db.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'probe_legacy'`,
    );
    expect(schemas.rowCount).toBe(0);
  }, 60_000);
});
