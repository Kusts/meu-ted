/**
 * Phase 2.1 — Schema fingerprint script (READ-ONLY).
 *
 * Extracts the real database schema: tables, columns, constraints,
 * indexes, and balance semantics. Outputs to stdout as JSON for
 * documentation and decision-making.
 *
 * Usage: npx tsx apps/api/src/scripts/fingerprint-schema.ts
 */

import { createPool } from '../db/pool.js';

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is required.');
  process.exit(1);
}

const main = async (): Promise<void> => {
  const pool = createPool({ connectionString: DATABASE_URL });

  try {
    // ── Database identity ──────────────────────────────────────────
    const dbInfo = await pool.query<{ current_database: string; version: string }>(
      `SELECT current_database(), version()`,
    );
    console.log('# Database Identity');
    console.log(`database: ${dbInfo.rows[0]!.current_database}`);
    console.log(`version: ${dbInfo.rows[0]!.version.split(',')[0]}`);
    console.log('');

    // ── Tables ─────────────────────────────────────────────────────
    const tables = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
    );

    console.log('# Tables');
    for (const t of tables.rows) {
      console.log(`## ${t.table_name}`);

      // Columns
      const cols = await pool.query<{
        column_name: string; data_type: string; is_nullable: string; column_default: string | null;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [t.table_name],
      );
      for (const c of cols.rows) {
        const nullable = c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const def = c.column_default ? ` DEFAULT ${c.column_default}` : '';
        console.log(`  ${c.column_name}: ${c.data_type} ${nullable}${def}`);
      }

      // Constraints
      const cons = await pool.query<{ constraint_name: string; constraint_type: string; constraint_def: string }>(
        `SELECT
           con.conname AS constraint_name,
           con.contype AS constraint_type,
           pg_get_constraintdef(con.oid) AS constraint_def
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid = con.conrelid
         JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
         WHERE nsp.nspname = 'public' AND rel.relname = $1`,
        [t.table_name],
      );
      for (const c of cons.rows) {
        const typeMap: Record<string, string> = { p: 'PRIMARY KEY', f: 'FOREIGN KEY', u: 'UNIQUE', c: 'CHECK' };
        console.log(`  CONSTRAINT ${c.constraint_name} ${typeMap[c.constraint_type] || c.constraint_type}: ${c.constraint_def}`);
      }

      // Indexes (excluding PK/UNIQUE which are constraint-backed)
      const idx = await pool.query<{ indexname: string; indexdef: string }>(
        `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = $1
         AND indexname NOT IN (
           SELECT con.conname FROM pg_constraint con
           JOIN pg_class rel ON rel.oid = con.conrelid
           WHERE rel.relname = $1
         )
         ORDER BY indexname`,
        [t.table_name],
      );
      for (const i of idx.rows) {
        console.log(`  INDEX ${i.indexname}: ${i.indexdef}`);
      }
      console.log('');
    }

    // ── Row counts ─────────────────────────────────────────────────
    console.log('# Row Counts');
    for (const t of tables.rows) {
      const count = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM "${t.table_name}"`,
      );
      console.log(`  ${t.table_name}: ${count.rows[0]!.count} rows`);
    }

    // ── Balance semantics ──────────────────────────────────────────
    console.log('');
    console.log('# Balance Semantics');
    const balanceCheck = await pool.query<{ has_trigger: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname LIKE '%balance%' OR tgname LIKE '%set_updated%'
      ) AS has_trigger`,
    );
    console.log(`triggers_found: ${balanceCheck.rows[0]!.has_trigger}`);

    // Check if balance_cents is computed or stored
    const acctCols = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'accounts'
       AND column_name LIKE '%balance%'`,
    );
    for (const c of acctCols.rows) {
      console.log(`accounts.${c.column_name}: ${c.data_type}`);
    }

    // Check if there's a function/trigger for balance updates
    const funcs = await pool.query<{ routine_name: string }>(
      `SELECT routine_name FROM information_schema.routines
       WHERE routine_schema = 'public' AND routine_name LIKE '%balance%'`,
    );
    for (const f of funcs.rows) {
      console.log(`balance_function: ${f.routine_name}`);
    }

    console.log('');
    console.log('# Complete');
  } finally {
    await pool.end();
  }
};

void main();
