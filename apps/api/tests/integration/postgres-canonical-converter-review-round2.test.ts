/**
 * REVIEW ROUND 2 integration (TDD RED→GREEN, PG-gated like the m1–m4 suites).
 *
 * H:  archive without `card_purchases` but with a flagged transaction →
 *     `resolveStatementLinks` fails closed naming the missing table.
 * M1: canonical transaction carrying a statement_id divergent from its
 *     linked card_purchases row → fails closed naming the transaction.
 * M2: pgcrypto + app homonym `digest(text)` (distinct signature from the
 *     extension `digest(text,text)`) → inventory keeps the app function,
 *     drops the extension one, and the archive move succeeds.
 * M3: markerless partial state (legacy_archive with relations, no marker)
 *     → `runCanonicalConversion` refuses with a RESTORE orientation,
 *     never a generic NO-GO.
 *
 * Dedicated throwaway DATABASE, dropped in afterAll. Each case uses
 * isolated schemas (or cleans public) so cases do not interfere.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { BalanceError, resolveStatementLinks } from '../../src/scripts/canonical-converter/balances.js';
import {
  buildArchiveStatements,
  CONVERSION_MARKER_TABLE,
} from '../../src/scripts/canonical-converter/archive-and-bootstrap.js';
import { ConversionError, runCanonicalConversion } from '../../src/scripts/canonical-converter/convert.js';
import { listRelations } from '../../src/scripts/canonical-converter/plan.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log('[postgres-canonical-converter-review-round2] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER required.');
}

const DB_NAME = `pi_converter_r2_${process.pid}`;

let adminPool: Pool | undefined;
let db: Pool | undefined;

describeIfDb('Postgres canonical converter review round 2', () => {
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
    await requireTestDatabase(db, 'converter-review-round2-fixture');
    process.env.BACKUP_CONFIRMED = 'true';
    process.env.BACKUP_ID = `test-backup-r2-${randomUUID()}`;
  }, 180_000);

  afterAll(async () => {
    await db?.end();
    await adminPool?.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`).catch(() => undefined);
    await adminPool?.end();
  }, 120_000);

  it('H: missing archive card_purchases with a flagged transaction fails closed', async () => {
    await db!.query(`CREATE SCHEMA h_archive`);
    await db!.query(
      `CREATE TABLE h_archive.transactions (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, is_credit_card_purchase BOOLEAN, deleted_at TIMESTAMPTZ)`,
    );
    await db!.query(
      `INSERT INTO h_archive.transactions (id, household_id, is_credit_card_purchase, deleted_at) VALUES ('tx-h9', 'hh-h', true, NULL)`,
    );
    try {
      const failure = await resolveStatementLinks(db!, { schema: 'h_canon', archiveSchema: 'h_archive' }).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(BalanceError);
      expect((failure as Error).message).toMatch(/card_purchases/i);
      expect((failure as Error).message).toMatch(/missing/i);
    } finally {
      await db!.query(`DROP SCHEMA h_archive CASCADE`);
    }
  }, 60_000);

  it('M1: divergent pre-existing statement link fails closed naming the transaction', async () => {
    await db!.query(`CREATE SCHEMA m1_archive`);
    await db!.query(`CREATE SCHEMA m1_canon`);
    await db!.query(
      `CREATE TABLE m1_archive.transactions (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, deleted_at TIMESTAMPTZ)`,
    );
    await db!.query(
      `CREATE TABLE m1_archive.card_purchases (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, transaction_id TEXT, statement_id TEXT)`,
    );
    await db!.query(`CREATE TABLE m1_archive.statements (id TEXT PRIMARY KEY, household_id TEXT NOT NULL)`);
    await db!.query(
      `INSERT INTO m1_archive.transactions (id, household_id, deleted_at) VALUES ('tx-m1a', 'hh-m1', NULL), ('tx-m1b', 'hh-m1', NULL)`,
    );
    await db!.query(`INSERT INTO m1_archive.statements (id, household_id) VALUES ('st-1', 'hh-m1'), ('st-2', 'hh-m1')`);
    await db!.query(
      `INSERT INTO m1_archive.card_purchases (id, household_id, transaction_id, statement_id) VALUES ('cp-1', 'hh-m1', 'tx-m1a', 'st-1'), ('cp-2', 'hh-m1', 'tx-m1b', 'st-1')`,
    );
    await db!.query(
      `CREATE TABLE m1_canon.transactions (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, statement_id TEXT, deleted_at TIMESTAMPTZ)`,
    );
    await db!.query(
      `CREATE TABLE m1_canon.card_purchases (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, transaction_id TEXT, statement_id TEXT)`,
    );
    // tx-m1a is unlinked (backfill candidate); tx-m1b already carries st-2
    // while its purchase links st-1 → divergent.
    await db!.query(
      `INSERT INTO m1_canon.transactions (id, household_id, statement_id, deleted_at) VALUES ('tx-m1a', 'hh-m1', NULL, NULL), ('tx-m1b', 'hh-m1', 'st-2', NULL)`,
    );
    await db!.query(
      `INSERT INTO m1_canon.card_purchases (id, household_id, transaction_id, statement_id) VALUES ('cp-1', 'hh-m1', 'tx-m1a', 'st-1'), ('cp-2', 'hh-m1', 'tx-m1b', 'st-1')`,
    );
    try {
      const failure = await resolveStatementLinks(db!, { schema: 'm1_canon', archiveSchema: 'm1_archive' }).catch(
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(BalanceError);
      expect((failure as Error).message).toMatch(/divergent/i);
      expect((failure as Error).message).toMatch(/tx-m1b/);
      // The silent path must NOT have backfilled tx-m1a either.
      const kept = await db!.query(`SELECT statement_id FROM m1_canon.transactions WHERE id = 'tx-m1a'`);
      expect(kept.rows[0]!.statement_id).toBeNull();
    } finally {
      await db!.query(`DROP SCHEMA m1_archive CASCADE`);
      await db!.query(`DROP SCHEMA m1_canon CASCADE`);
    }
  }, 60_000);

  it('M2: app homonym digest(text) survives the extension filter and archives', async () => {
    await db!.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    // NOTE: PG forbids an identical name+argtypes pair, so the homonym uses
    // digest/1 — same NAME as the extension digest/2, distinct signature.
    await db!.query(`CREATE OR REPLACE FUNCTION public.digest(text) RETURNS text AS $$ SELECT $1 $$ LANGUAGE sql IMMUTABLE`);
    try {
      const relations = await listRelations(db!, 'public');
      const digests = relations.filter((r) => r.name === 'digest' && r.kind === 'function');
      expect(digests).toHaveLength(1);
      expect(digests[0]!.identityArguments).toBe('text');
      expect(relations.map((r) => r.name)).not.toContain('gen_random_uuid');
      // The inventoried app function must be archivable (the statement the
      // bootstrap would run for it).
      await db!.query(`CREATE SCHEMA IF NOT EXISTS m2_archive`);
      const statements = buildArchiveStatements(
        relations.filter((r) => r.name === 'digest' && r.kind === 'function'),
        'public',
        'm2_archive',
      );
      expect(statements).toHaveLength(1);
      for (const statement of statements) {
        await db!.query(statement);
      }
      const moved = await db!.query(
        `SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'm2_archive' AND p.proname = 'digest') AS ok`,
      );
      expect(moved.rows[0]!.ok).toBe(true);
    } finally {
      await db!.query(`DROP SCHEMA m2_archive CASCADE`).catch(() => undefined);
      await db!.query(`DROP FUNCTION IF EXISTS m2_archive.digest(text)`).catch(() => undefined);
      await db!.query(`DROP FUNCTION IF EXISTS public.digest(text)`).catch(() => undefined);
    }
  }, 60_000);

  it('M3: markerless partial state refuses with a RESTORE orientation, not a generic NO-GO', async () => {
    // Simulate a bootstrap that failed BEFORE writing the marker: the
    // archive holds relations, public is emptied, and NO marker row exists.
    await db!.query(`CREATE SCHEMA legacy_archive`);
    await db!.query(`CREATE TABLE legacy_archive.accounts (id TEXT PRIMARY KEY)`);
    const markerProbe = await db!.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS ok`,
      [CONVERSION_MARKER_TABLE],
    );
    if (markerProbe.rows[0]!.ok === true) {
      await db!.query(`DROP TABLE public.${CONVERSION_MARKER_TABLE}`);
    }
    try {
      const failure = await runCanonicalConversion(db!).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ConversionError);
      const message = (failure as Error).message;
      expect(message).toMatch(/RESTAURE/i);
      expect(message).toMatch(/marker/i);
      expect(message).not.toMatch(/NO-GO/);
    } finally {
      await db!.query(`DROP SCHEMA legacy_archive CASCADE`);
    }
  }, 60_000);
});
