import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import {
  expectedMigrationManifest,
  planMigrations,
} from '../../src/read-models/sql/migrate.js';

const v056 = readFileSync(
  new URL('../../src/read-models/sql/V056__statement_payment_link.sql', import.meta.url),
  'utf8',
);
const v057 = readFileSync(
  new URL('../../src/read-models/sql/V057__statement_payment_household_fk.sql', import.meta.url),
  'utf8',
);

describe('V057 statement payment composite FK (static)', () => {
  it('is registered in the canonical manifest only (legacy keeps description matching)', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(57);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).not.toContain(57);
  });

  it('keeps V056 as the immutable base form: single-column FK, no composite, no rewrite', () => {
    // V056 must stay the base shape any already-applied database could hold:
    // nullable column + single-column FK to statements(id) + partial index.
    expect(v056).toMatch(/ALTER TABLE transactions ADD COLUMN IF NOT EXISTS statement_payment_id UUID/i);
    expect(v056).toMatch(/FOREIGN KEY \(statement_payment_id\)/i);
    expect(v056).toMatch(/REFERENCES statements \(id\)/i);
    expect(v056).toMatch(/CREATE INDEX IF NOT EXISTS transactions_statement_payment_idx/i);
    // The composite upgrade lives in V057 — V056 must not be rewritten to carry it.
    expect(v056).not.toMatch(/FOREIGN KEY \(statement_payment_id, household_id\)/i);
    expect(v056).not.toMatch(/transactions_statement_payment_household_fkey/);
    expect(v056).not.toMatch(/statements_id_household_uidx/);
  });

  it('upgrades the link to a composite household FK idempotently', () => {
    // Backing UNIQUE for the composite target.
    expect(v057).toMatch(/statements_id_household_uidx/i);
    expect(v057).toMatch(/UNIQUE \(id, household_id\)/i);
    // Drops the V056 single-column FK (named + any auto-named remainder)…
    expect(v057).toMatch(/statement_payment_id/);
    expect(v057).toMatch(/DROP CONSTRAINT/i);
    // …and enforces the composite household FK.
    expect(v057).toMatch(/transactions_statement_payment_household_fkey/i);
    expect(v057).toMatch(/FOREIGN KEY \(statement_payment_id, household_id\)/i);
    expect(v057).toMatch(/REFERENCES statements \(id, household_id\)/i);
    // Re-runnable: guarded ADDs only.
    expect(v057).toMatch(/IF NOT EXISTS/);
    expect(v057).not.toMatch(/DROP TABLE/);
    expect(v057).not.toMatch(/DROP COLUMN/);
  });
});

describe('V056/V057 upgrade planning (no drift on old V056)', () => {
  it('a database with the old V056 base registered sees no drift and V057 pending', () => {
    const manifest = expectedMigrationManifest(false);
    const v056Entry = manifest.find((m) => m.version === 56)!;
    const v057Entry = manifest.find((m) => m.version === 57)!;
    expect(v056Entry).toBeDefined();
    expect(v057Entry).toBeDefined();
    // Simulate a database where the V056 base form already applied (checksum
    // matches the restored base file): no drift may fire, V057 stays pending.
    const plan = planMigrations(manifest, [
      { version: 56, name: v056Entry.name, checksum: v056Entry.checksum },
    ]);
    expect(plan.drift).toEqual([]);
    expect(plan.pending.map((m) => m.version)).toContain(57);
  });
});

/**
 * PostgreSQL-gated apply proof: fresh V056+V057, upgrade from a V056-base
 * database, and cross-household rejection. Same gate as the V056 suite
 * (DATABASE_URL_TEST + DB_TEST_MARKER); skips honestly without both.
 */
const DB_URL = process.env.DATABASE_URL_TEST;
const PG_ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfPg = PG_ENABLED ? describe : describe.skip;

if (!PG_ENABLED) {
  console.log(
    '[v057-statement-payment-composite-fk] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER are required — Postgres apply proof skipped.',
  );
}

const suffix = `${process.pid}_${Date.now()}`;
const SCHEMA = `v057_${suffix}`;

const scopedPool = (schema: string): Pool => {
  const url = new URL(DB_URL!);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return createPool({ connectionString: url.toString(), max: 4 });
};

let adminPool: Pool | undefined;
let db: Pool | undefined;

const createPreV056Schema = async (pool: Pool): Promise<void> => {
  await pool.query(`
    CREATE TABLE accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id UUID NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      balance_cents BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE statements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id UUID NOT NULL,
      account_id UUID NOT NULL REFERENCES accounts(id),
      cycle_year_month TEXT NOT NULL,
      closing_date DATE NOT NULL,
      due_date DATE NOT NULL,
      total_cents BIGINT NOT NULL DEFAULT 0,
      paid_cents BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      household_id UUID NOT NULL,
      kind TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents BIGINT NOT NULL,
      date DATE NOT NULL,
      account_id UUID NOT NULL,
      statement_id UUID REFERENCES statements(id),
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
};

const seedHousehold = async (pool: Pool) => {
  const householdId = (await pool.query(`SELECT gen_random_uuid() AS id`)).rows[0]!['id'] as string;
  const accountId = (
    await pool.query(`INSERT INTO accounts (household_id, name, kind) VALUES ($1, 'Card', 'credit_card') RETURNING id`, [
      householdId,
    ])
  ).rows[0]!['id'] as string;
  const statementId = (
    await pool.query(
      `INSERT INTO statements (household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, status)
       VALUES ($1, $2, '2026-09', CURRENT_DATE, CURRENT_DATE, 5000, 'closed') RETURNING id`,
      [householdId, accountId],
    )
  ).rows[0]!['id'] as string;
  return { householdId, accountId, statementId };
};

describeIfPg('V057 statement payment composite FK (postgres apply proof)', () => {
  beforeAll(async () => {
    adminPool = createPool({ connectionString: DB_URL!, max: 2 });
    await requireTestDatabase(adminPool, 'schema-create');
    db = scopedPool(SCHEMA);
    await adminPool.query(`CREATE SCHEMA ${SCHEMA}`);
    await adminPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await createPreV056Schema(db);
  }, 120_000);

  afterAll(async () => {
    await adminPool?.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => undefined);
    await db?.end();
    await adminPool?.end();
  });

  it('fresh schema: V056 base then V057 applies idempotently with the composite FK', async () => {
    await db!.query(v056);
    await db!.query(v057);
    await db!.query(v056);
    await db!.query(v057);
    const fk = await db!.query(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'transactions'::regclass
          AND conname = 'transactions_statement_payment_household_fkey'`,
    );
    expect(fk.rowCount).toBe(1);
    const single = await db!.query(
      `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND c.conrelid = 'transactions'::regclass
          AND c.confrelid = 'statements'::regclass
          AND a.attname = 'statement_payment_id'
          AND array_length(c.conkey, 1) = 1`,
    );
    expect(single.rowCount).toBe(0);
  });

  it('upgrade: a V056-base database receives V057 and the composite FK', async () => {
    // Simulate the old registration: V056 base applied long ago (already the
    // case on this schema — re-assert the single-column FK is gone only after
    // V057). Reset to the base shape first: drop composite, restore single.
    await db!.query(`ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_statement_payment_household_fkey`);
    await db!.query(
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_statement_payment_id_fkey') THEN
           ALTER TABLE transactions ADD CONSTRAINT transactions_statement_payment_id_fkey
             FOREIGN KEY (statement_payment_id) REFERENCES statements (id);
         END IF;
       END $$`,
    );
    // V057 upgrades idempotently.
    await db!.query(v057);
    await db!.query(v057);
    const fk = await db!.query(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'transactions'::regclass
          AND conname = 'transactions_statement_payment_household_fkey'`,
    );
    expect(fk.rowCount).toBe(1);
  });

  it('rejects a cross-household statement_payment_id; same-household stays valid', async () => {
    const a = await seedHousehold(db!);
    const b = await seedHousehold(db!);
    const same = await db!.query(
      `INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, statement_payment_id)
       VALUES ($1, 'expense', 'Pagamento fatura 2026-09', 5000, CURRENT_DATE, $2, $3) RETURNING id`,
      [a.householdId, a.accountId, a.statementId],
    );
    expect(same.rowCount).toBe(1);
    await expect(
      db!.query(
        `INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, statement_payment_id)
         VALUES ($1, 'expense', 'cross-household payment', 100, CURRENT_DATE, $2, $3)`,
        [b.householdId, b.accountId, a.statementId],
      ),
    ).rejects.toThrow(/violates foreign key|transactions_statement_payment_household_fkey/i);
  });
});
