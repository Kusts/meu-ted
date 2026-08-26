import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { runMigrations, expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const describeIfDb = DB_URL ? describe : describe.skip;

describeIfDb('V032 PostgreSQL live upgrade on legacy schema', () => {
  const suffix = `${process.pid}_${Date.now()}`;
  const successSchema = `v032_success_${suffix}`;
  const orphanSchema = `v032_orphan_${suffix}`;

  let adminPool: Pool;
  let successPool: Pool;
  let orphanPool: Pool;

  const scopedPool = (schema: string): Pool => {
    const url = new URL(DB_URL!);
    url.searchParams.set('options', `-c search_path=${schema},public`);
    return createPool({ connectionString: url.toString() });
  };

  const setupLegacySchema = async (pool: Pool): Promise<void> => {
    // 1. Create minimal legacy accounts table (without updated_at)
    await pool.query(`
      CREATE TABLE accounts (
        id UUID PRIMARY KEY,
        household_id UUID NOT NULL,
        name TEXT NOT NULL,
        is_credit_card BOOLEAN NOT NULL DEFAULT true,
        active BOOLEAN NOT NULL DEFAULT true
      );
    `);

    // 2. Create legacy statements table
    await pool.query(`
      CREATE TABLE statements (
        id UUID PRIMARY KEY,
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
    `);

    // 3. Create minimal legacy card_purchases table (NO household_id, NO updated_at)
    await pool.query(`
      CREATE TABLE card_purchases (
        id UUID PRIMARY KEY,
        statement_id UUID NOT NULL,
        description TEXT NOT NULL,
        amount_cents BIGINT NOT NULL,
        date DATE NOT NULL,
        category_id UUID,
        installments_total INTEGER,
        installment_number INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 4. Mark all pre-V032 legacy-safe migrations as applied in _migrations
    await pool.query(`
      CREATE TABLE _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const legacyManifest = expectedMigrationManifest(true);
    for (const entry of legacyManifest) {
      if (entry.version < 32) {
        await pool.query(
          `INSERT INTO _migrations (version, name, checksum) VALUES ($1, $2, $3)`,
          [entry.version, entry.name, entry.checksum],
        );
      }
    }
  };

  beforeAll(async () => {
    adminPool = createPool({ connectionString: DB_URL! });
    await adminPool.query(`CREATE SCHEMA ${successSchema}`);
    await adminPool.query(`CREATE SCHEMA ${orphanSchema}`);

    successPool = scopedPool(successSchema);
    orphanPool = scopedPool(orphanSchema);

    await setupLegacySchema(successPool);
    await setupLegacySchema(orphanPool);
  });

  afterAll(async () => {
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${successSchema} CASCADE`);
      await adminPool.query(`DROP SCHEMA IF EXISTS ${orphanSchema} CASCADE`);
      await Promise.all([adminPool.end(), successPool?.end(), orphanPool?.end()]);
    }
  });

  it('successfully upgrades legacy schema, backfills household_id/account_id, adds updated_at and creates indexes', async () => {
    const householdId = '11111111-1111-4111-8111-111111111111';
    const accountId = '22222222-2222-4222-8222-222222222222';
    const statementId = '33333333-3333-4333-8333-333333333333';
    const purchaseId = '44444444-4444-4444-8444-444444444444';

    // Seed valid legacy relationship
    await successPool.query(
      `INSERT INTO accounts (id, household_id, name, is_credit_card) VALUES ($1, $2, 'Nubank Legacy', true)`,
      [accountId, householdId],
    );

    await successPool.query(
      `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date)
       VALUES ($1, $2, $3, '2026-08', '2026-08-10', '2026-08-18')`,
      [statementId, householdId, accountId],
    );

    await successPool.query(
      `INSERT INTO card_purchases (id, statement_id, description, amount_cents, date)
       VALUES ($1, $2, 'Compra Supermercado', 15000, '2026-08-05')`,
      [purchaseId, statementId],
    );

    // Execute legacy migration runner
    const result = await runMigrations(successPool, true);
    expect(result.applied).toContain(32);

    // 1. Prove column presence on card_purchases
    const cpColumns = await successPool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'card_purchases'`,
      [successSchema],
    );
    const cpColumnNames = cpColumns.rows.map(r => r.column_name);
    expect(cpColumnNames).toContain('household_id');
    expect(cpColumnNames).toContain('account_id');
    expect(cpColumnNames).toContain('updated_at');
    expect(cpColumnNames).toContain('is_recurring');

    // 2. Prove column presence on accounts
    const accColumns = await successPool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'accounts'`,
      [successSchema],
    );
    const accColumnNames = accColumns.rows.map(r => r.column_name);
    expect(accColumnNames).toContain('updated_at');
    expect(accColumnNames).toContain('created_at');

    // 3. Prove data backfill from statement
    const purchaseRow = await successPool.query<{ household_id: string; account_id: string }>(
      `SELECT household_id, account_id FROM card_purchases WHERE id = $1`,
      [purchaseId],
    );
    expect(purchaseRow.rows[0]?.household_id).toBe(householdId);
    expect(purchaseRow.rows[0]?.account_id).toBe(accountId);

    // 4. Prove indexes creation
    const indexRows = await successPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'card_purchases'`,
      [successSchema],
    );
    const indexNames = indexRows.rows.map(r => r.indexname);
    expect(indexNames).toContain('card_purchases_household_statement_idx');
    expect(indexNames).toContain('card_purchases_household_idx');
  });

  it('fails and rolls back with RAISE EXCEPTION when orphan purchases exist, leaving all rows intact', async () => {
    const householdId = '55555555-5555-4555-8555-555555555555';
    const accountId = '66666666-6666-4666-8666-666666666666';
    const statementId = '77777777-7777-4777-8777-777777777777';
    const validPurchaseId = '88888888-8888-4888-8888-888888888888';
    const orphanPurchaseId = '99999999-9999-4999-8999-999999999999';
    const unresolvableStatementId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    // Seed valid account and statement
    await orphanPool.query(
      `INSERT INTO accounts (id, household_id, name, is_credit_card) VALUES ($1, $2, 'Nubank Orphan Test', true)`,
      [accountId, householdId],
    );
    await orphanPool.query(
      `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date)
       VALUES ($1, $2, $3, '2026-08', '2026-08-10', '2026-08-18')`,
      [statementId, householdId, accountId],
    );

    // Seed 1 valid purchase + 1 orphan purchase with unresolvable statement_id
    await orphanPool.query(
      `INSERT INTO card_purchases (id, statement_id, description, amount_cents, date)
       VALUES ($1, $2, 'Compra Valida', 5000, '2026-08-05')`,
      [validPurchaseId, statementId],
    );
    await orphanPool.query(
      `INSERT INTO card_purchases (id, statement_id, description, amount_cents, date)
       VALUES ($1, $2, 'Compra Orfa Sem Fatura', 9900, '2026-08-06')`,
      [orphanPurchaseId, unresolvableStatementId],
    );

    // Migration MUST fail due to orphan detection
    await expect(runMigrations(orphanPool, true)).rejects.toThrow(
      /found card_purchases with unresolvable household_id/i,
    );

    // Prove data was NOT deleted and all rows remain intact
    const countRes = await orphanPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM card_purchases`,
    );
    expect(countRes.rows[0]?.count).toBe('2');

    const rows = await orphanPool.query<{ id: string; description: string }>(
      `SELECT id, description FROM card_purchases ORDER BY date ASC`,
    );
    expect(rows.rows.map(r => r.id)).toEqual([validPurchaseId, orphanPurchaseId]);

    // Migration 32 should NOT be recorded as applied in _migrations table
    const appliedRes = await orphanPool.query<{ version: number }>(
      `SELECT version FROM _migrations WHERE version = 32`,
    );
    expect(appliedRes.rows.length).toBe(0);
  });
});
