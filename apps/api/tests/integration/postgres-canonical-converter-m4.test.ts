/**
 * M4 canonical converter proof (anchor release + identity + orchestrator).
 *
 * PG-gated (DATABASE_URL_TEST + DB_TEST_MARKER). Uses a dedicated throwaway
 * DATABASE per run (same pattern as the M1–M3 suites): the converter
 * archives everything out of `public`, so schema-level isolation is not
 * enough. The database is dropped in afterAll.
 *
 * Fixture: minimal legacy snapshot WITH a nonzero initial balance and NO
 * households table (the probable production shape: V020 never ran there).
 * One archived user, no memberships, no Better Auth rows.
 *
 * Flow: dry-run proves read-only (pre/post snapshots identical, no marker)
 * -> full pipeline runs to `completed` (anchor preserved, balances
 * recomputed, household + owner membership derived and marked, marker
 * summary written) -> rerun verifies and no-ops without rewriting ->
 * canonical reconciliation reports 0 drift on the fixture.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runCanonicalConversion } from '../../src/scripts/canonical-converter/convert.js';
import { runReconciliation } from '../../src/scripts/reconciliation/run.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log('[postgres-canonical-converter-m4] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER required.');
}

const DB_NAME = `pi_converter_m4_${process.pid}`;
const BACKUP_ID = `test-backup-m4-${randomUUID()}`;

let adminPool: Pool | undefined;
let db: Pool | undefined;

const legacyFixtureDDL = `
  CREATE TABLE accounts (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, name TEXT NOT NULL,
    is_credit_card BOOLEAN NOT NULL DEFAULT false,
    initial_balance_cents BIGINT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE transactions (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, kind TEXT NOT NULL,
    description TEXT NOT NULL, amount_cents BIGINT NOT NULL, date DATE NOT NULL,
    from_account_id UUID, to_account_id UUID,
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
    id UUID PRIMARY KEY, auth_user_id TEXT, email TEXT, name TEXT
  );
  -- M2 import pre-write checks reference these columns even when empty.
  CREATE TABLE memberships (id UUID PRIMARY KEY, user_id TEXT NOT NULL, household_id UUID, role TEXT);
  CREATE TABLE invites (id UUID PRIMARY KEY, household_id UUID, email TEXT, role TEXT, token_hash TEXT, expires_at TIMESTAMPTZ, invited_by_user_id TEXT, accepted_at TIMESTAMPTZ);
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

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACC_BANK = '33333333-3333-4333-8333-333333333333';
const ACC_CASH = '44444444-4444-4334-8334-444444444444';
const CAT_FOOD = '55555555-5555-4555-8555-555555555555';

const snapshotPublic = async (pool: Pool): Promise<string> => {
  const relations = await pool.query(
    `SELECT c.relname AS name, c.relkind AS kind
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' ORDER BY c.relname, c.relkind`,
  );
  const counts: string[] = [];
  for (const row of relations.rows) {
    const name = String(row.name);
    if (row.kind !== 'r') continue;
    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM "public"."${name.replace(/"/g, '""')}"`);
    counts.push(`${name}=${Number(count.rows[0]!.n)}`);
  }
  return JSON.stringify({ relations: relations.rows, counts });
};

describeIfDb('Postgres canonical converter M4 (anchor + identity + orchestrator)', () => {
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
    await requireTestDatabase(db, 'converter-m4-fixture');
    await db.query(legacyFixtureDDL);
    // One user, no memberships, no households table: the owner binds by
    // single-creator fallback and is explicitly marked derived.
    await db.query(`INSERT INTO users (id, auth_user_id, email, name) VALUES ($1, NULL, 'owner@example.com', 'Owner')`, [
      USER_ID,
    ]);
    await db.query(
      `INSERT INTO accounts (id, household_id, name, is_credit_card, initial_balance_cents, active)
       VALUES ($1, $2, 'Checking', false, 5000, true), ($3, $2, 'Wallet', false, 0, true)`,
      [ACC_BANK, HOUSEHOLD, ACC_CASH],
    );
    await db.query(`INSERT INTO categories (id, household_id, name, kind, active) VALUES ($1, $2, 'Food', 'expense', true)`, [
      CAT_FOOD,
      HOUSEHOLD,
    ]);
    await db.query(
      `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, to_account_id)
       VALUES ($1, $2, 'income', 'Pay', 1000, '2026-09-01', NULL, $3),
              ($4, $2, 'expense', 'Bread', 200, '2026-09-01', $3, NULL),
              ($5, $2, 'transfer', 'Move', 150, '2026-09-02', $3, $6)`,
      [randomUUID(), HOUSEHOLD, ACC_BANK, randomUUID(), randomUUID(), ACC_CASH],
    );
    await db.query(`INSERT INTO _migrations (version, name, checksum) VALUES (3, 'V003__legacy_safe_tables.sql', $1)`, [
      realChecksumOf('V003__legacy_safe_tables.sql'),
    ]);
    process.env.BACKUP_CONFIRMED = 'true';
    process.env.BACKUP_ID = BACKUP_ID;
  }, 180_000);

  afterAll(async () => {
    await db?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`).catch(() => undefined);
    await adminPool?.end();
  }, 120_000);

  it('dry-runs read-only: plan GO with the anchor informational, zero writes', async () => {
    const before = await snapshotPublic(db!);
    const report = await runCanonicalConversion(db!, { dryRun: true });
    expect(report.status).toBe('dry-run');
    expect(report.plan.ready).toBe(true);
    expect(report.plan.blockers).toEqual([]);
    expect(report.plan.informational).toContainEqual(
      expect.objectContaining({ code: 'nonzero_initial_balance', count: 1 }),
    );
    expect(report.plan.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(report.import).toBeUndefined();
    expect(report.identity).toBeUndefined();
    expect(report.balances).toBeUndefined();
    // No writes: same relations, same counts, no marker, legacy shape intact.
    expect(await snapshotPublic(db!)).toBe(before);
    const marker = await db!.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_conversion_marker') AS exists`,
    );
    expect(marker.rows[0]!.exists).toBe(false);
    const legacyCols = await db!.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts'`,
    );
    expect(legacyCols.rows.map((r) => String(r.column_name))).toContain('is_credit_card');
  }, 120_000);

  it('converts end-to-end: anchor, derived identity and recomputed balances', async () => {
    const report = await runCanonicalConversion(db!);
    expect(report.status).toBe('completed');
    expect(report.backupId).toBe(BACKUP_ID);
    expect(report.plan.ready).toBe(true);
    expect(report.durationMs).toEqual(expect.any(Number));

    const byEntity = new Map(report.import!.entities.map((e) => [e.name, e]));
    expect(byEntity.get('accounts')).toMatchObject({ legacyCount: 2, importedCount: 2 });
    expect(byEntity.get('transactions')).toMatchObject({ legacyCount: 3, importedCount: 3 });
    expect(byEntity.get('users')).toMatchObject({ legacyCount: 1, importedCount: 1 });
    for (const entity of report.import!.entities) {
      expect(entity.equivalenceHash).toMatch(/^[0-9a-f]{64}$/);
    }

    // Households absent from the archive are derived, never invented blind:
    // same UUIDs, V020 wording, single archived creator, marked derived.
    expect(report.identity!.derived).toEqual({ households: 1, memberships: 1 });
    expect(report.identity!.householdIds).toEqual([HOUSEHOLD]);
    expect(report.identity!.authorizedBy).toBe(report.plan.fingerprint);
    const household = await db!.query(`SELECT id, name, kind, owner_user_id FROM public.households`);
    expect(household.rows).toHaveLength(1);
    expect(household.rows[0]).toMatchObject({
      id: HOUSEHOLD,
      name: 'Migrated household',
      kind: 'shared',
      owner_user_id: USER_ID,
    });
    const membership = await db!.query(
      `SELECT user_id, household_id, role, status FROM public.memberships`,
    );
    expect(membership.rows).toHaveLength(1);
    expect(membership.rows[0]).toMatchObject({
      user_id: USER_ID,
      household_id: HOUSEHOLD,
      role: 'owner',
      status: 'active',
    });

    // Anchor travels exactly; stored balances equal anchor + ledger.
    // bank: 5000 + 1000 − 200 − 150 = 5650; cash: 0 + 150 = 150.
    const accounts = await db!.query(
      `SELECT id, initial_balance_cents, balance_cents FROM public.accounts ORDER BY id`,
    );
    const byId = new Map(accounts.rows.map((r) => [String(r.id), r]));
    expect(Number(byId.get(ACC_BANK)!.initial_balance_cents)).toBe(5000);
    expect(Number(byId.get(ACC_BANK)!.balance_cents)).toBe(5650);
    expect(Number(byId.get(ACC_CASH)!.initial_balance_cents)).toBe(0);
    expect(Number(byId.get(ACC_CASH)!.balance_cents)).toBe(150);
    expect(report.balances!.backfilled).toMatchObject({ updated: 2, canonicalCount: 2 });
    expect(report.balances!.verified).toMatchObject({ checked: 2, mismatched: [] });

    // Completion marker carries the counts summary and the plan fingerprint.
    const marker = await db!.query(`SELECT backup_id, state, plan_fingerprint, summary FROM public._conversion_marker`);
    expect(marker.rowCount).toBe(1);
    expect(marker.rows[0]!.backup_id).toBe(BACKUP_ID);
    expect(marker.rows[0]!.state).toBe('completed');
    expect(marker.rows[0]!.plan_fingerprint).toBe(report.plan.fingerprint);
    const summary = marker.rows[0]!.summary as {
      entities: Array<{ entity: string; archive: number; canonical: number }>;
    };
    expect(summary.entities.find((e) => e.entity === 'accounts')).toMatchObject({
      archive: 2,
      canonical: 2,
    });
    // FINDING-2: balances travel as bigint; the report serializes them as
    // decimal strings (same replacer as the CLI).
    expect(JSON.stringify(report, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))).not.toMatch(
      /\d{4}-\d{2}-\d{2}T\d{2}:/,
    );
  }, 300_000);

  it('reruns as a verified no-op without rewriting anything', async () => {
    const markerBefore = await db!.query(`SELECT finished_at FROM public._conversion_marker`);
    const report = await runCanonicalConversion(db!);
    expect(report.status).toBe('noop');
    expect(report.backupId).toBe(BACKUP_ID);
    expect(report.verification!.planFingerprintMatch).toBe(true);
    expect(report.verification!.ledger).toMatchObject({ pending: 0 });
    expect(report.verification!.balances).toMatchObject({ checked: 2, mismatched: [] });
    const accounts = report.verification!.entityCounts.find((e) => e.entity === 'accounts');
    expect(accounts).toMatchObject({ archive: 2, canonical: 2 });
    const markerAfter = await db!.query(`SELECT finished_at FROM public._conversion_marker`);
    expect(markerAfter.rows[0]!.finished_at).toEqual(markerBefore.rows[0]!.finished_at);
  }, 300_000);

  it('reconciles the converted fixture with zero drift', async () => {
    const report = await runReconciliation(db!, 'canonical', HOUSEHOLD);
    expect(report.totals.drifted).toBe(0);
    expect(report.checks.find((c) => c.check === 'accounts_balance')!.counts).toEqual({
      checked: 2,
      drifted: 0,
    });
  }, 120_000);

  it('restores Better Auth identity tables by column intersection in isolation', async () => {
    const { restoreAuthIdentity } = await import('../../src/scripts/canonical-converter/identity.js');
    await db!.query(`CREATE SCHEMA IF NOT EXISTS stage_archive`);
    await db!.query(`CREATE SCHEMA IF NOT EXISTS stage`);
    await db!.query(`CREATE TABLE stage_archive."user" (id TEXT PRIMARY KEY, email TEXT NOT NULL)`);
    await db!.query(`CREATE TABLE stage."user" (id TEXT PRIMARY KEY, email TEXT NOT NULL)`);
    await db!.query(`INSERT INTO stage_archive."user" (id, email) VALUES ('auth-u1', 'owner@example.com')`);
    try {
      const result = await restoreAuthIdentity(db!, { schema: 'stage', archiveSchema: 'stage_archive' });
      expect(result.tables.find((t) => t.name === 'user')).toMatchObject({
        archived: 1,
        restored: 1,
        status: 'restored',
      });
      const restored = await db!.query(`SELECT id, email FROM stage."user"`);
      expect(restored.rows).toHaveLength(1);
      await expect(restoreAuthIdentity(db!, { schema: 'stage', archiveSchema: 'stage_archive' })).rejects.toThrow(
        /not empty/,
      );
    } finally {
      await db!.query(`DROP SCHEMA stage CASCADE`);
      await db!.query(`DROP SCHEMA stage_archive CASCADE`);
    }
  }, 120_000);
});
