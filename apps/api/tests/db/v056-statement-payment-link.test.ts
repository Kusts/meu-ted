import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const v056 = readFileSync(
  new URL('../../src/read-models/sql/V056__statement_payment_link.sql', import.meta.url),
  'utf8',
);

// Legacy preamble that shipped with `#` shell-style comments. PostgreSQL has
// no `#` line comment (only `--` and `/* */`), so the file failed at apply
// time with a syntax error and blocked cutover. Kept inline so the
// regression guard fails even after the file itself is fixed.
const LEGACY_HASH_PREAMBLE = [
  '# V056 — structured link for canonical statement payments.',
  '# payStatement previously created only a free-text payment expense',
  'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS statement_payment_id UUID;',
].join('\n');

/**
 * Minimal PostgreSQL-comment validator for migration files.
 * Walks the SQL tracking `--` line comments, `/* *\/` blocks, single-quoted
 * strings (with `''` escapes) and double-quoted identifiers (with `""`
 * escapes); any `#` reached in normal code is a shell-style comment and
 * therefore a PostgreSQL syntax error. Throws on the first offender.
 */
const assertNoHashComments = (sql: string): void => {
  let line = 1;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    // `--` line comment: skip to end of line.
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }
    // `/* */` block comment: skip to close.
    if (ch === '/' && sql[i + 1] === '*') {
      const close = sql.indexOf('*/', i + 2);
      if (close === -1) throw new Error(`unterminated block comment at line ${line}`);
      line += sql.slice(i, close).split('\n').length - 1;
      i = close + 2;
      continue;
    }
    // Single-quoted string literal ('' = escaped quote).
    if (ch === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        if (sql[i] === '\n') line += 1;
        i += 1;
      }
      continue;
    }
    // Double-quoted identifier ("" = escaped quote).
    if (ch === '"') {
      i += 1;
      while (i < sql.length && sql[i] !== '"') {
        if (sql[i] === '\n') line += 1;
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === '#') {
      throw new Error(
        `invalid PostgreSQL syntax at line ${line}: '#' is not a comment in PostgreSQL (use '--' or '/* */')`,
      );
    }
    i += 1;
  }
};

/**
 * Statements visible after stripping `--`/`/* *\/` comments.
 * String-, identifier- and dollar-quote-aware: a `;` inside a `'...'` literal,
 * a `"..."` identifier or a `$tag$ ... $tag$` body (e.g. `DO $$ ... $$`) never
 * ends a statement. Boundaries are recorded during the scan (a trailing
 * `split(';')` would re-split the preserved interior semicolons).
 */
const visibleStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let buf = '';
  let i = 0;
  let inString = false;
  let inIdent = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;
  const flush = (): void => {
    const stmt = buf.trim();
    if (stmt.length > 0) statements.push(stmt);
    buf = '';
  };
  while (i < sql.length) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      buf += ch;
      i += 1;
      continue;
    }
    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        buf += ch;
      }
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (inString) {
      buf += ch;
      if (ch === "'") {
        if (next === "'") {
          buf += next;
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (inIdent) {
      buf += ch;
      if (ch === '"') inIdent = false;
      i += 1;
      continue;
    }
    if (ch === '-' && next === '-') {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }
    // Dollar-quoted string/`DO $$ ... $$` body: swallow verbatim (incl. `;`).
    const dollarOpen = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
    if (ch === '$' && dollarOpen) {
      dollarTag = dollarOpen[0];
      buf += dollarTag;
      i += dollarTag.length;
      continue;
    }
    if (ch === "'") inString = true;
    if (ch === '"') inIdent = true;
    if (ch === ';') {
      flush();
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return statements;
};

describe('V056 statement payment link (postgres syntax)', () => {
  it('is registered in the canonical manifest only (legacy keeps description matching)', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(56);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).not.toContain(56);
  });

  it('regression: the legacy `#`-commented preamble is rejected as invalid PostgreSQL', () => {
    expect(() => assertNoHashComments(LEGACY_HASH_PREAMBLE)).toThrow(/#.*not a comment/);
  });

  it('carries no `#` comments (every comment is `--` or `/* */`)', () => {
    expect(() => assertNoHashComments(v056)).not.toThrow();
    for (const rawLine of v056.split('\n')) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      expect(line.startsWith('#'), `hash comment leaked: ${rawLine}`).toBe(false);
    }
  });

  it('parses to the intended base statements with no behavior/schema drift', () => {
    const statements = visibleStatements(v056);
    // Immutable base: nullable column + single-column FK + partial index.
    // The composite household upgrade lives in V057 — V056 must not be
    // rewritten to carry it (guarded-era drift guard would refuse boot).
    expect(statements).toHaveLength(3);
    expect(statements[0]).toMatch(/ALTER TABLE transactions ADD COLUMN IF NOT EXISTS statement_payment_id UUID/i);
    expect(statements[1]).toMatch(/transactions_statement_payment_id_fkey/i);
    expect(statements[1]).toMatch(/FOREIGN KEY \(statement_payment_id\)/i);
    expect(statements[1]).toMatch(/REFERENCES statements \(id\)/i);
    expect(statements[2]).toMatch(/CREATE INDEX IF NOT EXISTS transactions_statement_payment_idx/i);
    expect(statements[2]).toMatch(/WHERE statement_payment_id IS NOT NULL AND deleted_at IS NULL/i);
    expect(v056).not.toMatch(/FOREIGN KEY \(statement_payment_id, household_id\)/i);
    expect(v056).not.toMatch(/transactions_statement_payment_household_fkey/);
    expect(v056).not.toMatch(/statements_id_household_uidx/);
    expect(v056).not.toMatch(/DROP TABLE/);
    expect(v056).not.toMatch(/DROP COLUMN/);
  });
});

/**
 * PostgreSQL-gated apply proof for the V056 base shape.
 *
 * The lexer block above cannot prove the migration applies. This block
 * applies the real V056 file on a disposable test database after a
 * representative canonical schema (pre-V056 transactions + V004
 * statements — the full runMigrations path on a fresh schema is broken
 * at HEAD by pre-existing V049 drift, see
 * postgres-canonical-parity-v41.test.ts), then verifies the column,
 * single-column FK, partial index, and legacy-exclusion semantics.
 * Household isolation (composite FK, cross-household rejection) is V057's
 * contract — see v057-statement-payment-composite-fk.test.ts.
 *
 * Gate: DATABASE_URL_TEST + DB_TEST_MARKER (same as every other
 * PG-gated suite). Without both, this block skips honestly and the
 * lexer block above remains the only guard.
 */
const DB_URL = process.env.DATABASE_URL_TEST;
const PG_ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfPg = PG_ENABLED ? describe : describe.skip;

if (!PG_ENABLED) {
  console.log(
    '[v056-statement-payment-link] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER are required — Postgres apply proof skipped.',
  );
}

const suffix = `${process.pid}_${Date.now()}`;
const SCHEMA = `v056_${suffix}`;

const scopedPool = (schema: string): Pool => {
  const url = new URL(DB_URL!);
  url.searchParams.set('options', `-c search_path=${schema},public`);
  return createPool({ connectionString: url.toString(), max: 4 });
};

let adminPool: Pool | undefined;
let db: Pool | undefined;

/** Representative canonical pre-V056 shape: no statement_payment_id. */
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

const columnInfo = async (pool: Pool) =>
  pool.query(
    `SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'transactions'
        AND column_name = 'statement_payment_id'`,
  );

describeIfPg('V056 statement payment link (postgres apply proof)', () => {
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

  it('RED: pre-V056 schema has no statement_payment_id column', async () => {
    const cols = await columnInfo(db!);
    expect(cols.rowCount).toBe(0);
    await expect(
      db!.query(`INSERT INTO transactions
        (household_id, kind, description, amount_cents, date, account_id, statement_payment_id)
        VALUES (gen_random_uuid(), 'expense', 'probe', 100, CURRENT_DATE, gen_random_uuid(), gen_random_uuid())`),
    ).rejects.toThrow(/statement_payment_id/);
  });

  it('rejects the legacy `#`-commented preamble on real PostgreSQL', async () => {
    const client = await db!.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query(LEGACY_HASH_PREAMBLE)).rejects.toThrow();
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('applies the V056 file idempotently', async () => {
    await db!.query(v056);
    await db!.query(v056);
  });

  it('adds a nullable UUID column with a single-column FK to statements(id)', async () => {
    const cols = await columnInfo(db!);
    expect(cols.rowCount).toBe(1);
    expect(cols.rows[0]!['data_type']).toBe('uuid');
    expect(cols.rows[0]!['is_nullable']).toBe('YES');
    const fk = await db!.query(
      `SELECT c.conname, array_agg(a.attname ORDER BY a.attnum) AS cols
         FROM pg_constraint c
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND c.conrelid = 'transactions'::regclass
          AND c.confrelid = 'statements'::regclass
          AND c.conname = 'transactions_statement_payment_id_fkey'
        GROUP BY c.conname`,
    );
    expect(fk.rowCount).toBe(1);
    // node-postgres returns a Postgres array literal; compare as a set.
    const fkCols = String(fk.rows[0]!['cols']).replace(/[{}]/g, '').split(',').sort();
    expect(fkCols).toEqual(['statement_payment_id']);
    // Base shape carries no composite enforcement — that is V057's contract.
    const composite = await db!.query(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = 'transactions'::regclass
          AND conname = 'transactions_statement_payment_household_fkey'`,
    );
    expect(composite.rowCount).toBe(0);
  });

  it('creates the partial index for structured coverage', async () => {
    const idx = await db!.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'transactions'
          AND indexname = 'transactions_statement_payment_idx'`,
    );
    expect(idx.rowCount).toBe(1);
    expect(idx.rows[0]!['indexdef'] as string).toMatch(/statement_payment_id/);
    expect(idx.rows[0]!['indexdef'] as string).toMatch(/WHERE.*statement_payment_id IS NOT NULL/);
  });

  it('links a payment to its statement; dangling ids fail; NULL stays fail-closed; legacy manifest excludes V056', async () => {
    const hh = await db!.query(`SELECT gen_random_uuid() AS id`);
    const householdId = hh.rows[0]!['id'] as string;
    const acc = await db!.query(
      `INSERT INTO accounts (household_id, name, kind) VALUES ($1, 'Card', 'credit_card') RETURNING id`,
      [householdId],
    );
    const accountId = acc.rows[0]!['id'] as string;
    const stmt = await db!.query(
      `INSERT INTO statements (household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, status)
       VALUES ($1, $2, '2026-09', CURRENT_DATE, CURRENT_DATE, 5000, 'closed') RETURNING id`,
      [householdId, accountId],
    );
    const statementId = stmt.rows[0]!['id'] as string;

    const pay = await db!.query(
      `INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, statement_payment_id)
       VALUES ($1, 'expense', 'Pagamento fatura 2026-09', 5000, CURRENT_DATE, $2, $3) RETURNING id`,
      [householdId, accountId, statementId],
    );
    expect(pay.rowCount).toBe(1);
    const join = await db!.query(
      `SELECT t.id FROM transactions t JOIN statements s ON t.statement_payment_id = s.id
        WHERE t.id = $1`,
      [pay.rows[0]!['id'] as string],
    );
    expect(join.rowCount).toBe(1);

    await expect(
      db!.query(
        `INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id, statement_payment_id)
         VALUES ($1, 'expense', 'dangling', 100, CURRENT_DATE, $2, gen_random_uuid())`,
        [householdId, accountId],
      ),
    ).rejects.toThrow(/violates foreign key|statement_payment_id/i);

    // Legacy semantics: old rows keep NULL and never join as structured coverage.
    await db!.query(
      `INSERT INTO transactions (household_id, kind, description, amount_cents, date, account_id)
       VALUES ($1, 'expense', 'Pagamento fatura 2026-09', 5000, CURRENT_DATE, $2)`,
      [householdId, accountId],
    );
    const structured = await db!.query(
      `SELECT COUNT(*)::int AS n FROM transactions t JOIN statements s ON t.statement_payment_id = s.id
        WHERE t.household_id = $1 AND t.deleted_at IS NULL`,
      [householdId],
    );
    expect(Number(structured.rows[0]!['n'])).toBe(1);

    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(56);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).not.toContain(56);
  });
});
