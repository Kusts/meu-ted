/**
 * FINDING-3 integration: a database carrying pgcrypto (installed by
 * V001/V013/V053 via `CREATE EXTENSION IF NOT EXISTS`) archives cleanly.
 * Extension-owned functions must be excluded from the inventory
 * (`pg_depend deptype = 'e'`) — `ALTER FUNCTION ... SET SCHEMA` refuses
 * to move them — and the extension itself stays in `public` so the
 * canonical bootstrap's idempotent `CREATE EXTENSION IF NOT EXISTS`
 * keeps `gen_random_uuid()`/`digest()` resolvable.
 *
 * PG-gated (DATABASE_URL_TEST + DB_TEST_MARKER). Dedicated throwaway
 * DATABASE, dropped in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { listRelations } from '../../src/scripts/canonical-converter/plan.js';
import { buildArchiveStatements } from '../../src/scripts/canonical-converter/archive-and-bootstrap.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log('[postgres-canonical-converter-extensions] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER required.');
}

const DB_NAME = `pi_converter_ext_${process.pid}`;

let adminPool: Pool | undefined;
let db: Pool | undefined;

describeIfDb('Postgres canonical converter extensions (FINDING-3)', () => {
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
    await requireTestDatabase(db, 'converter-extensions-fixture');
    await db.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.query(`CREATE TABLE widgets (id UUID PRIMARY KEY, name TEXT NOT NULL)`);
  }, 180_000);

  afterAll(async () => {
    await db?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`).catch(() => undefined);
    await adminPool?.end();
  }, 120_000);

  it('excludes extension-owned functions from the inventory', async () => {
    const relations = await listRelations(db!, 'public');
    const names = relations.map((r) => r.name);
    expect(names).toContain('widgets');
    expect(names).not.toContain('gen_random_uuid');
    expect(names).not.toContain('digest');
    expect(relations.filter((r) => r.kind === 'function').map((r) => r.name)).not.toContain('gen_random_uuid');
  }, 60_000);

  it('archives app tables while the extension stays in public', async () => {
    const relations = await listRelations(db!, 'public');
    await db!.query(`CREATE SCHEMA IF NOT EXISTS legacy_archive`);
    for (const statement of buildArchiveStatements(relations, 'public', 'legacy_archive')) {
      await db!.query(statement);
    }
    const moved = await db!.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'legacy_archive' AND table_name = 'widgets') AS ok`,
    );
    expect(moved.rows[0]!.ok).toBe(true);
    const extSchema = await db!.query(
      `SELECT n.nspname AS schema FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pgcrypto'`,
    );
    expect(extSchema.rows[0]!.schema).toBe('public');
    // Extension functions still resolve in public after the archive.
    const uuid = await db!.query(`SELECT gen_random_uuid() AS id`);
    expect(uuid.rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/i);
  }, 60_000);
});
