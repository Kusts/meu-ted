/**
 * M1 canonical converter proof (plan + archive-and-bootstrap).
 *
 * PG-gated (DATABASE_URL_TEST + DB_TEST_MARKER). Uses a dedicated throwaway
 * DATABASE per run (never the shared `public` used by other suites: the
 * converter archives everything out of `public`, so schema-level isolation
 * is not enough). The database is dropped in afterAll.
 *
 * Flow: dirty legacy fixtures -> plan NOT ready (drift, orphans, nonzero
 * initial balance) -> clean fixtures -> plan ready -> archive-and-bootstrap
 * -> canonical shape + full ledger + archived counts + marker -> rerun
 * no-op -> changed backup id fails closed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';
import { collectConversionPlan } from '../../src/scripts/canonical-converter/plan.js';
import { runArchiveAndBootstrap } from '../../src/scripts/canonical-converter/archive-and-bootstrap.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log('[postgres-canonical-converter-m1] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER required.');
}

const DB_NAME = `pi_converter_m1_${process.pid}`;
const BACKUP_ID = `test-backup-${randomUUID()}`;

let adminPool: Pool | undefined;
let db: Pool | undefined;

const legacyFixtureDDL = `
  CREATE TABLE accounts (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, name TEXT NOT NULL,
    is_credit_card BOOLEAN NOT NULL DEFAULT false,
    initial_balance_cents BIGINT NOT NULL DEFAULT 0,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE transactions (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, kind TEXT NOT NULL,
    description TEXT NOT NULL, amount_cents BIGINT NOT NULL, date DATE NOT NULL,
    from_account_id UUID, to_account_id UUID,
    category_id UUID, subcategory_id UUID,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE categories (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, name TEXT NOT NULL,
    kind TEXT NOT NULL, parent_id UUID,
    active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE statements (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, account_id UUID NOT NULL,
    cycle_year_month TEXT NOT NULL, total_cents BIGINT NOT NULL DEFAULT 0,
    paid_cents BIGINT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open'
  );
  CREATE TABLE card_purchases (
    id UUID PRIMARY KEY, household_id UUID NOT NULL,
    transaction_id UUID, statement_id UUID,
    description TEXT NOT NULL DEFAULT '', amount_cents BIGINT NOT NULL DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE users (
    id UUID PRIMARY KEY, auth_user_id TEXT NOT NULL, email TEXT
  );
  CREATE TABLE memberships (id UUID PRIMARY KEY, user_id TEXT NOT NULL);
  CREATE TABLE invites (id UUID PRIMARY KEY, invited_by_user_id TEXT);
  CREATE TABLE _migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL,
    checksum TEXT NOT NULL DEFAULT '',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

const realChecksumOf = (file: string): string => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'read-models', 'sql');
  return createHash('sha256').update(readFileSync(join(dir, file), 'utf8'), 'utf8').digest('hex');
};

const tableCount = async (pool: Pool, schema: string, table: string): Promise<number> => {
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM "${schema}"."${table}"`);
  return Number(res.rows[0]!.n);
};

const columnNames = async (pool: Pool, schema: string, table: string): Promise<string[]> => {
  const res = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return res.rows.map((row) => String(row.column_name));
};

describeIfDb('Postgres canonical converter M1 (plan + archive-and-bootstrap)', () => {
  beforeAll(async () => {
    adminPool = createPool({ connectionString: DB_URL!, max: 2 });
    await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
    const url = new URL(DB_URL!);
    url.pathname = `/${DB_NAME}`;
    db = createPool({ connectionString: url.toString(), max: 4, connectionTimeoutMillis: 60_000 });
    // A freshly created database can take a while to accept its first TCP
    // connection through the forwarded port; retry briefly instead of
    // failing the suite on cold-start latency.
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
    await db.query(
      `CREATE TABLE _test_marker (marker_value TEXT NOT NULL)`,
    );
    await db.query(`INSERT INTO _test_marker (marker_value) VALUES ($1)`, [
      process.env.DB_TEST_MARKER!,
    ]);
    await requireTestDatabase(db, 'converter-fixture');
    await db.query(legacyFixtureDDL);

    const household = randomUUID();
    const accA = randomUUID();
    const accB = randomUUID();
    await db.query(
      `INSERT INTO accounts (id, household_id, name, is_credit_card, initial_balance_cents)
       VALUES ($1, $2, 'Checking', false, 500), ($3, $2, 'Wallet', false, 0)`,
      [accA, household, accB],
    );
    await db.query(
      `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id)
       VALUES ($1, $2, 'expense', 'Orphan spend', 1000, CURRENT_DATE, NULL)`,
      [randomUUID(), household],
    );
    await db.query(
      `INSERT INTO users (id, auth_user_id, email) VALUES ($1, 'auth-u1', 'owner@example.com')`,
      [randomUUID()],
    );
    await db.query(`INSERT INTO memberships (id, user_id) VALUES ($1, 'auth-u1')`, [randomUUID()]);
    await db.query(`INSERT INTO _migrations (version, name, checksum) VALUES (3, 'V003__legacy_safe_tables.sql', 'tampered')`);
    process.env.BACKUP_CONFIRMED = 'true';
    process.env.BACKUP_ID = BACKUP_ID;
  }, 120_000);

  afterAll(async () => {
    await db?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`).catch(() => undefined);
    await adminPool?.end();
  });

  it('plans NO-GO on drift and orphans while nonzero initials stay informational (M4 anchor)', async () => {
    const plan = await collectConversionPlan(db!);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'migration_baseline_drift' }),
    );
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'orphan_transactions', count: 1 }),
    );
    expect(plan.blockers).not.toContainEqual(
      expect.objectContaining({ code: 'nonzero_initial_balance' }),
    );
    expect(plan.informational).toContainEqual(
      expect.objectContaining({ code: 'nonzero_initial_balance', count: 1 }),
    );
  }, 120_000);

  it('plans GO after the fixtures are cleaned', async () => {
    await db!.query(`DELETE FROM transactions WHERE description = 'Orphan spend'`);
    await db!.query(`UPDATE accounts SET initial_balance_cents = 0`);
    await db!.query(`UPDATE _migrations SET checksum = $1 WHERE version = 3`, [
      realChecksumOf('V003__legacy_safe_tables.sql'),
    ]);
    const plan = await collectConversionPlan(db!);
    expect(plan.blockers).toEqual([]);
    expect(plan.ready).toBe(true);
  }, 120_000);

  it('archives legacy, bootstraps canonical and records the marker', async () => {
    const before: Record<string, number> = {};
    for (const table of ['accounts', 'transactions', 'categories', 'statements', 'card_purchases']) {
      before[table] = await tableCount(db!, 'public', table);
    }
    const result = await runArchiveAndBootstrap(db!);
    expect(result.status).toBe('bootstrapped');
    expect(result.backupId).toBe(BACKUP_ID);
    expect(result.applied.length).toBeGreaterThan(0);

    expect(await columnNames(db!, 'public', 'accounts')).toContain('kind');
    expect(await columnNames(db!, 'public', 'transactions')).toContain('account_id');

    const manifest = expectedMigrationManifest(false);
    const ledger = await db!.query(`SELECT version FROM _migrations`);
    const applied = new Set(ledger.rows.map((row) => Number(row.version)));
    for (const entry of manifest) {
      expect(applied.has(entry.version)).toBe(true);
    }

    for (const [table, count] of Object.entries(before)) {
      expect(await tableCount(db!, 'legacy_archive', table)).toBe(count);
    }

    const marker = await db!.query(`SELECT backup_id, state FROM _conversion_marker`);
    expect(marker.rowCount).toBe(1);
    expect(marker.rows[0]!.backup_id).toBe(BACKUP_ID);
    expect(marker.rows[0]!.state).toBe('bootstrap_completed');

    // The converter archives every public relation, including the test
    // marker. Re-mark the fresh canonical public so later runs keep the
    // test guard satisfied (production has no marker table).
    await db!.query(`CREATE TABLE _test_marker (marker_value TEXT NOT NULL)`);
    await db!.query(`INSERT INTO _test_marker (marker_value) VALUES ($1)`, [
      process.env.DB_TEST_MARKER!,
    ]);
  }, 180_000);

  it('reruns as a verified no-op on the same backup id', async () => {
    const result = await runArchiveAndBootstrap(db!);
    expect(result.status).toBe('noop');
    expect(result.backupId).toBe(BACKUP_ID);
  }, 120_000);

  it('fails closed when the backup id changes', async () => {
    const previous = process.env.BACKUP_ID;
    process.env.BACKUP_ID = `other-backup-${randomUUID()}`;
    try {
      await expect(runArchiveAndBootstrap(db!)).rejects.toThrow(/backup/i);
    } finally {
      process.env.BACKUP_ID = previous;
    }
  }, 120_000);
});
