/**
 * M2 canonical converter proof (mapping + per-entity import).
 *
 * PG-gated (DATABASE_URL_TEST + DB_TEST_MARKER). Uses a dedicated throwaway
 * DATABASE per run (never the shared `public`: the converter archives
 * everything out of `public`, so schema-level isolation is not enough).
 * The database is dropped in afterAll. A single database serves both
 * flows to halve the CREATE/MIGRATE/DROP I/O cost (Docker Desktop fsyncs
 * make each cycle tens of seconds): flow B injects its duplicate into the
 * archive AFTER the GO plan, then removes it before flow A.
 *
 * Flow A (happy path): hand-built legacy fixtures -> plan GO ->
 * archive-and-bootstrap -> import -> counts/IDs/FKs/legs verified,
 * audit_logs retained in the archive, idempotency rows identical,
 * device tokens re-anchored on the hash placeholder.
 *
 * Flow B (fail-closed): duplicated statements in the archive -> import
 * refuses BEFORE writing (canonical statements table stays empty).
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { collectConversionPlan } from '../../src/scripts/canonical-converter/plan.js';
import { runArchiveAndBootstrap } from '../../src/scripts/canonical-converter/archive-and-bootstrap.js';
import { runCanonicalImport } from '../../src/scripts/canonical-converter/import.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log('[postgres-canonical-converter-m2] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER required.');
}

const DB_NAME = `pi_converter_m2_${process.pid}`;
const BACKUP_ID = `test-backup-m2-${randomUUID()}`;

let adminPool: Pool | undefined;
let db: Pool | undefined;

const legacyFixtureDDL = `
  CREATE TABLE households (id UUID PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'shared', owner_user_id UUID);
  CREATE TABLE users (id UUID PRIMARY KEY, auth_user_id TEXT NOT NULL, email TEXT, name TEXT);
  CREATE TABLE memberships (id UUID PRIMARY KEY, user_id TEXT NOT NULL, household_id UUID, role TEXT);
  CREATE TABLE invites (id UUID PRIMARY KEY, household_id UUID, email TEXT, role TEXT, token_hash TEXT, expires_at TIMESTAMPTZ, invited_by_user_id TEXT, accepted_at TIMESTAMPTZ);
  CREATE TABLE accounts (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, name TEXT NOT NULL,
    is_credit_card BOOLEAN NOT NULL DEFAULT false,
    initial_balance_cents BIGINT NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    credit_limit_cents BIGINT, closing_day INT, due_day INT,
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
    cycle_year_month TEXT NOT NULL, closing_date DATE NOT NULL, due_date DATE NOT NULL,
    total_cents BIGINT NOT NULL DEFAULT 0,
    paid_cents BIGINT NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'open'
  );
  CREATE TABLE transactions (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, kind TEXT NOT NULL,
    description TEXT NOT NULL, amount_cents BIGINT NOT NULL, date DATE NOT NULL,
    from_account_id UUID, to_account_id UUID,
    category_id UUID, subcategory_id UUID, notes TEXT,
    is_credit_card_purchase BOOLEAN, statement_id UUID,
    installments_total INT, installment_number INT,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE card_purchases (
    id UUID PRIMARY KEY, household_id UUID NOT NULL,
    account_id UUID, statement_id UUID,
    description TEXT NOT NULL DEFAULT '', amount_cents BIGINT NOT NULL DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_id UUID, installments SMALLINT,
    source_message_id TEXT,
    deleted_at TIMESTAMPTZ
  );
  CREATE TABLE accounts_payable (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, account_id UUID NOT NULL,
    description TEXT NOT NULL, amount_cents BIGINT NOT NULL, due_date DATE NOT NULL
  );
  CREATE TABLE budgets (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, category_id UUID,
    name TEXT NOT NULL, amount_cents BIGINT NOT NULL,
    period TEXT NOT NULL DEFAULT 'monthly', start_date DATE NOT NULL, end_date DATE NOT NULL
  );
  CREATE TABLE goals (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, name TEXT NOT NULL,
    goal_type TEXT NOT NULL DEFAULT 'savings',
    target_amount_cents BIGINT NOT NULL DEFAULT 0, current_amount_cents BIGINT NOT NULL DEFAULT 0,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE
  );
  CREATE TABLE goal_contributions (
    id UUID PRIMARY KEY, goal_id UUID NOT NULL, amount_cents BIGINT NOT NULL,
    contribution_date DATE NOT NULL DEFAULT CURRENT_DATE
  );
  CREATE TABLE payable_templates (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, account_id UUID,
    name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    amount_cents BIGINT NOT NULL, frequency TEXT NOT NULL DEFAULT 'monthly', day_of_month INT NOT NULL DEFAULT 1
  );
  CREATE TABLE notification_configs (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, chat_id TEXT NOT NULL,
    notification_type TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true
  );
  CREATE TABLE subscriptions (
    id UUID PRIMARY KEY, household_id UUID NOT NULL, name TEXT NOT NULL,
    amount_cents BIGINT NOT NULL, cycle TEXT NOT NULL DEFAULT 'monthly', day INT NOT NULL DEFAULT 1,
    payment_method TEXT NOT NULL DEFAULT 'bank', status TEXT NOT NULL DEFAULT 'active'
  );
  CREATE TABLE idempotency_keys (
    household_id UUID NOT NULL, key TEXT NOT NULL, payload_hash TEXT NOT NULL,
    response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (household_id, key)
  );
  CREATE TABLE device_tokens (
    token TEXT PRIMARY KEY, device_id TEXT NOT NULL, household_id UUID NOT NULL,
    token_hash TEXT, legacy BOOLEAN NOT NULL DEFAULT true
  );
  CREATE TABLE operation_records (
    id UUID PRIMARY KEY, workspace_id UUID NOT NULL, actor_id TEXT NOT NULL,
    operation TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
    status TEXT NOT NULL, lease_until TIMESTAMPTZ NOT NULL,
    retry_until TIMESTAMPTZ NOT NULL, retention_until TIMESTAMPTZ NOT NULL
  );
  CREATE TABLE audit_logs (
    id UUID PRIMARY KEY, operation_record_id UUID, workspace_id UUID NOT NULL,
    actor_id TEXT, operation TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
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

const connectWithRetry = async (url: string): Promise<Pool> => {
  const pool = createPool({ connectionString: url, max: 4, connectionTimeoutMillis: 60_000 });
  let connected = false;
  for (let attempt = 0; attempt < 12 && !connected; attempt++) {
    try {
      await pool.query('SELECT 1');
      connected = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
  }
  if (!connected) throw new Error('dedicated converter database never accepted connections');
  return pool;
};

const markTestDatabase = async (pool: Pool): Promise<void> => {
  await pool.query(`CREATE TABLE _test_marker (marker_value TEXT NOT NULL)`);
  await pool.query(`INSERT INTO _test_marker (marker_value) VALUES ($1)`, [process.env.DB_TEST_MARKER!]);
  await requireTestDatabase(pool, 'converter-fixture');
};

const tableCount = async (pool: Pool, schema: string, table: string): Promise<number> => {
  const res = await pool.query(`SELECT COUNT(*)::int AS n FROM "${schema}"."${table}"`);
  return Number(res.rows[0]!.n);
};

const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ACC_BANK = '33333333-3333-4333-8333-333333333333';
const ACC_CARD = '44444444-4444-4334-8334-444444444444';
const CAT_FOOD = '55555555-5555-4555-8555-555555555555';
const STATEMENT = '66666666-6666-4666-8666-666666666666';
const TX_EXPENSE = '77777777-7777-4777-8777-777777777777';
const TX_INCOME = '88888888-8888-4888-8888-888888888888';
const TX_TRANSFER = '99999999-9999-4999-8999-999999999999';

const seedHappyFixtures = async (pool: Pool): Promise<void> => {
  await pool.query(`INSERT INTO households (id, name, kind, owner_user_id) VALUES ($1, 'Home', 'shared', $2)`, [
    HOUSEHOLD,
    USER_ID,
  ]);
  await pool.query(`INSERT INTO users (id, auth_user_id, email, name) VALUES ($1, 'auth-u1', 'owner@example.com', 'Owner')`, [USER_ID]);
  await pool.query(`INSERT INTO memberships (id, user_id, household_id, role) VALUES ($1, 'auth-u1', $2, 'owner')`, [randomUUID(), HOUSEHOLD]);
  await pool.query(
    `INSERT INTO invites (id, household_id, email, role, token_hash, expires_at, invited_by_user_id, accepted_at)
     VALUES ($1, $2, 'guest@example.com', 'member', 'invite-hash-1', '2026-10-01T00:00:00Z', 'auth-u1', NULL)`,
    [randomUUID(), HOUSEHOLD],
  );
  await pool.query(
    `INSERT INTO accounts (id, household_id, name, is_credit_card, initial_balance_cents, active)
     VALUES ($1, $2, 'Checking', false, 0, true), ($3, $2, 'Card', true, 0, true)`,
    [ACC_BANK, HOUSEHOLD, ACC_CARD],
  );
  await pool.query(
    `INSERT INTO categories (id, household_id, name, kind, active) VALUES ($1, $2, 'Food', 'expense', true)`,
    [CAT_FOOD, HOUSEHOLD],
  );
  await pool.query(
    `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, paid_cents, status)
     VALUES ($1, $2, $3, '2026-09', '2026-09-10', '2026-09-17', 3000, 0, 'open')`,
    [STATEMENT, HOUSEHOLD, ACC_CARD],
  );
  await pool.query(
    `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, to_account_id, category_id, is_credit_card_purchase)
     VALUES ($1, $2, 'expense', 'Bread', 1000, '2026-09-01', $3, NULL, $4, true),
            ($5, $2, 'income', 'Pay', 5000, '2026-09-01', NULL, $3, NULL, NULL),
            ($6, $2, 'transfer', 'Move', 2000, '2026-09-02', $3, $3, NULL, NULL)`,
    [TX_EXPENSE, HOUSEHOLD, ACC_BANK, CAT_FOOD, TX_INCOME, TX_TRANSFER],
  );
  // Self-transfer would violate the canonical leg check; point it at the card instead.
  await pool.query(`UPDATE transactions SET to_account_id = $1 WHERE id = $2`, [ACC_CARD, TX_TRANSFER]);
  await pool.query(
    `INSERT INTO card_purchases (id, household_id, account_id, statement_id, description, amount_cents, date, transaction_id, installments, source_message_id)
     VALUES ($1, $2, $3, $4, 'Shop', 3000, '2026-09-04', $5, 3, 'wa-123')`,
    [randomUUID(), HOUSEHOLD, ACC_CARD, STATEMENT, TX_EXPENSE],
  );
  await pool.query(
    `INSERT INTO accounts_payable (id, household_id, account_id, description, amount_cents, due_date)
     VALUES ($1, $2, $3, 'Rent', 150000, '2026-10-05')`,
    [randomUUID(), HOUSEHOLD, ACC_BANK],
  );
  await pool.query(
    `INSERT INTO budgets (id, household_id, category_id, name, amount_cents, period, start_date, end_date)
     VALUES ($1, $2, $3, 'Food budget', 50000, 'monthly', '2026-09-01', '2026-09-30')`,
    [randomUUID(), HOUSEHOLD, CAT_FOOD],
  );
  const goalId = randomUUID();
  await pool.query(`INSERT INTO goals (id, household_id, name, target_amount_cents) VALUES ($1, $2, 'Trip', 200000)`, [
    goalId,
    HOUSEHOLD,
  ]);
  await pool.query(`INSERT INTO goal_contributions (id, goal_id, amount_cents, contribution_date) VALUES ($1, $2, 10000, '2026-09-05')`, [
    randomUUID(),
    goalId,
  ]);
  await pool.query(
    `INSERT INTO payable_templates (id, household_id, account_id, name, amount_cents, frequency)
     VALUES ($1, $2, $3, 'Gym', 9990, 'monthly')`,
    [randomUUID(), HOUSEHOLD, ACC_BANK],
  );
  await pool.query(
    `INSERT INTO notification_configs (id, household_id, chat_id, notification_type, enabled)
     VALUES ($1, $2, 'chat-1', 'due_today_reminder', true)`,
    [randomUUID(), HOUSEHOLD],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, household_id, name, amount_cents, cycle, status)
     VALUES ($1, $2, 'Music', 1990, 'monthly', 'active')`,
    [randomUUID(), HOUSEHOLD],
  );
  await pool.query(
    `INSERT INTO idempotency_keys (household_id, key, payload_hash, response)
     VALUES ($1, 'expense:cmd-1', 'hash-1', '{"ok": true}')`,
    [HOUSEHOLD],
  );
  await pool.query(
    `INSERT INTO device_tokens (token, device_id, household_id, token_hash, legacy)
     VALUES ('legacy-secret-1', 'dev-1', $1, 'tokhash-1', true)`,
    [HOUSEHOLD],
  );
  await pool.query(
    `INSERT INTO operation_records (id, workspace_id, actor_id, operation, idempotency_key, payload_hash, status, lease_until, retry_until, retention_until)
     VALUES ($1, $2, 'dev-1', 'transactions.create', 'op-1', 'ph-1', 'completed', NOW(), NOW(), NOW())`,
    [randomUUID(), HOUSEHOLD],
  );
  await pool.query(
    `INSERT INTO audit_logs (id, workspace_id, actor_id, operation) VALUES ($1, $2, 'dev-1', 'transactions.create')`,
    [randomUUID(), HOUSEHOLD],
  );
  await pool.query(`INSERT INTO _migrations (version, name, checksum) VALUES (3, 'V003__legacy_safe_tables.sql', $1)`, [
    realChecksumOf('V003__legacy_safe_tables.sql'),
  ]);
};

let planFingerprint = '';

describeIfDb('Postgres canonical converter M2 (mapping + import)', () => {
  beforeAll(async () => {
    adminPool = createPool({ connectionString: DB_URL!, max: 2 });
    await adminPool.query(`CREATE DATABASE "${DB_NAME}"`);
    const url = new URL(DB_URL!);
    url.pathname = `/${DB_NAME}`;
    db = await connectWithRetry(url.toString());
    await markTestDatabase(db);
    await db.query(legacyFixtureDDL);
    await seedHappyFixtures(db);
    process.env.BACKUP_CONFIRMED = 'true';
    process.env.BACKUP_ID = BACKUP_ID;
  }, 180_000);

  // DROP DATABASE fsyncs for tens of seconds on Docker Desktop file
  // sharing; the default 15s hook budget is too tight for even one.
  afterAll(async () => {
    await db?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`).catch(() => undefined);
    await adminPool?.end();
  }, 120_000);

  it('plans GO on the clean legacy fixtures', async () => {
    const plan = await collectConversionPlan(db!);
    expect(plan.ready).toBe(true);
    expect(plan.blockers).toEqual([]);
    planFingerprint = plan.fingerprint;
    expect(planFingerprint).toMatch(/^[0-9a-f]{64}$/);
  }, 120_000);

  it('refuses a duplicate-statement archive before writing anything', async () => {
    const bootstrap = await runArchiveAndBootstrap(db!);
    expect(bootstrap.status).toBe('bootstrapped');
    await db!.query(`CREATE TABLE _test_marker (marker_value TEXT NOT NULL)`);
    await db!.query(`INSERT INTO _test_marker (marker_value) VALUES ($1)`, [process.env.DB_TEST_MARKER!]);
    // Better Auth identity the archived users.auth_user_id points at
    // (canonical users.auth_user_id REFERENCES "user"(id)): identity rows
    // live outside the M2 entity list, so the fixture seeds the minimum.
    await db!.query(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('auth-u1', 'Owner', 'owner@example.com', false, NOW(), NOW())`,
    );
    // A duplicate lands in the archive AFTER the GO plan (race / manual
    // edit): the import must fail on the pre-write check with canonical
    // statements still empty.
    const dupId = randomUUID();
    await db!.query(
      `INSERT INTO legacy_archive.statements (id, household_id, account_id, cycle_year_month, closing_date, due_date)
       VALUES ($1, $2, $3, '2026-09', '2026-09-10', '2026-09-17')`,
      [dupId, HOUSEHOLD, ACC_CARD],
    );
    await expect(runCanonicalImport(db!, { planFingerprint })).rejects.toThrow(/duplicate_statements/);
    expect(await tableCount(db!, 'public', 'statements')).toBe(0);
    // Remove the injected duplicate so the happy-path import below runs
    // on the pristine archive.
    await db!.query(`DELETE FROM legacy_archive.statements WHERE id = $1`, [dupId]);
    // The failed import above committed the entities ordered before
    // statements (per-entity transactions by design). Roll those back
    // manually — children first, membership guards lifted — so the next
    // test imports into the pristine post-bootstrap state.
    await db!.query(`ALTER TABLE public.memberships DISABLE TRIGGER ALL`);
    for (const table of ['invites', 'memberships', 'households', 'categories', 'accounts', 'users']) {
      await db!.query(`DELETE FROM public."${table}"`);
    }
    await db!.query(`ALTER TABLE public.memberships ENABLE TRIGGER ALL`);
  }, 300_000);

  it('imports every entity with preserved ids and correct legs', async () => {

    const result = await runCanonicalImport(db!, { planFingerprint });
    expect(result.durationMs).toEqual(expect.any(Number));
    const byName = new Map(result.entities.map((e) => [e.name, e]));
    expect(byName.get('households')).toMatchObject({ legacyCount: 1, importedCount: 1, status: 'imported' });
    expect(byName.get('users')).toMatchObject({ legacyCount: 1, importedCount: 1 });
    expect(byName.get('memberships')).toMatchObject({ legacyCount: 1, importedCount: 1 });
    expect(byName.get('accounts')).toMatchObject({ legacyCount: 2, importedCount: 2 });
    expect(byName.get('transactions')).toMatchObject({ legacyCount: 3, importedCount: 3 });
    expect(byName.get('card_purchases')).toMatchObject({ legacyCount: 1, importedCount: 1 });
    expect(byName.get('idempotency_keys')).toMatchObject({ legacyCount: 1, importedCount: 1 });
    expect(byName.get('operation_records')).toMatchObject({ legacyCount: 1, importedCount: 1 });
    expect(byName.get('audit_logs')).toMatchObject({ legacyCount: 1, importedCount: 0, status: 'skipped' });
    for (const entity of result.entities) {
      expect(entity.equivalenceHash).toMatch(/^[0-9a-f]{64}$/);
    }
    // Proof structures carry no run-generated timestamps.
    expect(JSON.stringify(result.entities)).not.toMatch(/started_at|finished_at/);

    const accounts = await db!.query(`SELECT id, kind, status, balance_cents FROM public.accounts ORDER BY id`);
    expect(accounts.rows.map((r) => r.kind).sort()).toEqual(['bank', 'credit_card']);
    expect(accounts.rows.map((r) => Number(r.balance_cents))).toEqual([0, 0]);

    const expense = await db!.query(`SELECT account_id, transfer_to_account_id FROM public.transactions WHERE id = $1`, [
      TX_EXPENSE,
    ]);
    expect(expense.rows[0]).toMatchObject({ account_id: ACC_BANK, transfer_to_account_id: null });
    const income = await db!.query(`SELECT account_id FROM public.transactions WHERE id = $1`, [TX_INCOME]);
    expect(income.rows[0]).toMatchObject({ account_id: ACC_BANK });
    const transfer = await db!.query(
      `SELECT account_id, transfer_to_account_id FROM public.transactions WHERE id = $1`,
      [TX_TRANSFER],
    );
    expect(transfer.rows[0]).toMatchObject({ account_id: ACC_BANK, transfer_to_account_id: ACC_CARD });

    const membership = await db!.query(`SELECT user_id, household_id, role FROM public.memberships`);
    expect(membership.rows).toHaveLength(1);
    expect(membership.rows[0]).toMatchObject({ user_id: USER_ID, household_id: HOUSEHOLD, role: 'owner' });

    const token = await db!.query(`SELECT token, rtrim(token_hash) AS token_hash FROM public.device_tokens`);
    expect(token.rows).toHaveLength(1);
    expect(token.rows[0]).toMatchObject({ token: 'converted:tokhash-1', token_hash: 'tokhash-1' });

    const idem = await db!.query(`SELECT household_id, key, payload_hash, response FROM public.idempotency_keys`);
    expect(idem.rows).toHaveLength(1);
    expect(idem.rows[0]).toMatchObject({ key: 'expense:cmd-1', payload_hash: 'hash-1' });

    expect(await tableCount(db!, 'public', 'audit_logs')).toBe(0);
    expect(await tableCount(db!, 'legacy_archive', 'audit_logs')).toBe(1);

    const card = byName.get('card_purchases')!;
    expect(card.unmappedFields).toMatchObject({ source_message_id: 1 });
    const txs = byName.get('transactions')!;
    expect(txs.unmappedFields).toMatchObject({ is_credit_card_purchase: 1 });
  }, 300_000);
});
