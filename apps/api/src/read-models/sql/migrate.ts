/**
 * Minimal forward-only migration runner.
 *
 * Applies every `V###__*.sql` file under `src/read-models/sql/` in
 * lexical order, idempotently. Tracks applied versions in a
 * `_migrations` table.
 *
 * Intentionally tiny — no down-migrations, no checksum verification.
 * For a real project we'd add checksum verification; this is the seam.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbPool } from '../../db/pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = here;

const MIGRATION_RE = /^V(\d+)__([\w-]+)\.sql$/;

// Migrations safe to apply on the legacy pi_financeiro schema (DB_SCHEMA=legacy).
// V003 = device_tokens/idempotency; V008 = additive feature tables. The canonical
// V001/V002/V004-V007 are skipped because they assume the canonical schema and use
// the set_updated_at() trigger function that the legacy DB does not define.
const LEGACY_SAFE_PREFIXES = ['V003', 'V008'];

const ensureMigrationsTable = async (pool: DbPool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
};

const appliedVersions = async (pool: DbPool): Promise<Set<number>> => {
  const res = await pool.query<{ version: number }>('SELECT version FROM _migrations');
  return new Set(res.rows.map((r) => r.version));
};

export const runMigrations = async (pool: DbPool, legacyOnly = false): Promise<{ applied: number[] }> => {
  await ensureMigrationsTable(pool);
  const applied = await appliedVersions(pool);
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_RE.test(f) && (!legacyOnly || LEGACY_SAFE_PREFIXES.some((p) => f.startsWith(p))))
    .sort((a, b) => a.localeCompare(b));

  const newlyApplied: number[] = [];
  for (const file of files) {
    const m = MIGRATION_RE.exec(file);
    if (!m) continue;
    const version = Number(m[1]);
    if (applied.has(version)) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (version, name) VALUES ($1, $2)', [version, file]);
      await client.query('COMMIT');
      newlyApplied.push(version);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return { applied: newlyApplied };
};
