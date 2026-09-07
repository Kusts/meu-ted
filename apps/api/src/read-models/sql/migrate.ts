/**
 * Minimal forward-only migration runner.
 *
 * Applies every `V###__*.sql` file under `src/read-models/sql/` in
 * lexical order, idempotently. Tracks applied versions and checksums in
 * a `_migrations` table.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbPool } from "../../db/pool.js";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = here;
const MIGRATION_RE = /^V(\d+)__([\w-]+)\.sql$/;

type MigrationManifestEntry = {
  version: number;
  name: string;
  checksum: string;
};

// Migrations safe to apply on the legacy pi_financeiro schema (DB_SCHEMA=legacy).
// V003 = device_tokens/idempotency; V008 = additive feature tables; V009 = parent_id
// and subscriptions; V010/V011 = profiles; V012 = accounts_payable paid_transaction_id;
// V032 = legacy card_purchases household_id/updated_at and accounts updated_at.
// V033 = card_purchases transaction_id/deleted_at and FK to transactions.
// V043 = Better Auth admin/impersonation columns on the modern user/session/account
// tables (additive ADD COLUMN IF NOT EXISTS only; never touches legacy financial
// tables). Required in legacy mode because the production VPS boots with
// DB_SCHEMA=legacy and V031 (admin columns) was never legacy-safe, so login
// 500s with SCHEMA_MISMATCH until V043 applies at boot.
// The canonical V001/V002/V004-V007 and modern workspace/auth migrations V013-V031
// are skipped in legacy mode because they assume canonical schema or rely on modern
// tables (Better Auth, workspaces, ownership transfers).
const LEGACY_SAFE_PREFIXES = [
  "V003",
  "V008",
  "V009",
  "V010",
  "V011",
  "V012",
  "V032",
  "V033",
"V034",
  "V035",
  "V040",
  "V041",
  "V042",
  "V043",
  "V044",
  "V045",
  "V046",
  "V047",
];

export const migrationChecksum = (sql: string): string =>
  createHash("sha256").update(sql, "utf8").digest("hex");

const migrationFiles = (legacyOnly = false): string[] =>
  readdirSync(MIGRATIONS_DIR)
    .filter((file) => MIGRATION_RE.test(file))
    .filter(
      (file) =>
        !legacyOnly ||
        LEGACY_SAFE_PREFIXES.some((prefix) => file.startsWith(prefix)),
    )
    .sort((a, b) => a.localeCompare(b));

/** The file-backed migration contract used by startup schema verification. */
export const expectedMigrationManifest = (
  legacyOnly = false,
): MigrationManifestEntry[] =>
  migrationFiles(legacyOnly).map((file) => {
    const match = MIGRATION_RE.exec(file);
    if (!match) throw new Error(`invalid migration filename: ${file}`);
    return {
      version: Number(match[1]),
      name: file,
      checksum: migrationChecksum(
        readFileSync(join(MIGRATIONS_DIR, file), "utf8"),
      ),
    };
  });

const ensureMigrationsTable = async (pool: DbPool): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL DEFAULT '',
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum TEXT NOT NULL DEFAULT ''",
  );
};

const appliedVersions = async (pool: DbPool): Promise<AppliedMigrationRow[]> => {
  const res = await pool.query<AppliedMigrationRow>(
    "SELECT version, name, checksum FROM _migrations",
  );
  return res.rows.map((row) => ({
    version: row.version,
    name: row.name,
    checksum: row.checksum ?? '',
  }));
};

export type AppliedMigrationRow = {
  version: number;
  name: string;
  checksum: string;
};

export type MigrationDrift = {
  version: number;
  kind: 'checksum' | 'name';
  expected: string;
  applied: string;
};

export type MigrationPlan = {
  drift: MigrationDrift[];
  backfill: Array<{ version: number; checksum: string }>;
  pending: MigrationManifestEntry[];
};

/**
 * M-06: pure drift planner. Every applied version that also exists in the
 * manifest must match on file name AND checksum — an edited migration
 * aborts startup instead of running history silently diverged. Empty stored
 * checksums (pre-checksum rows) are adopted as baseline via backfill, never
 * treated as drift. Applied versions absent from the manifest (downgraded
 * code, legacy-only subset runs) are ignored, not drift.
 */
export const planMigrations = (
  manifest: MigrationManifestEntry[],
  applied: AppliedMigrationRow[],
): MigrationPlan => {
  const expected = new Map(manifest.map((m) => [m.version, m]));
  const appliedVersions = new Set(applied.map((r) => r.version));
  const drift: MigrationDrift[] = [];
  const backfill: Array<{ version: number; checksum: string }> = [];
  for (const row of applied) {
    const entry = expected.get(row.version);
    if (!entry) continue;
    if (!row.checksum) {
      backfill.push({ version: row.version, checksum: entry.checksum });
      continue;
    }
    if (row.name !== entry.name) {
      drift.push({ version: row.version, kind: 'name', expected: entry.name, applied: row.name });
    } else if (row.checksum !== entry.checksum) {
      drift.push({ version: row.version, kind: 'checksum', expected: entry.checksum, applied: row.checksum });
    }
  }
  const pending = manifest.filter((m) => !appliedVersions.has(m.version));
  return { drift, backfill, pending };
};

export const runMigrations = async (
  pool: DbPool,
  legacyOnly = false,
): Promise<{ applied: number[] }> => {
  await ensureMigrationsTable(pool);
  const manifest = expectedMigrationManifest(legacyOnly);
  const appliedRows = await appliedVersions(pool);
  const plan = planMigrations(manifest, appliedRows);
  if (plan.drift.length > 0) {
    const details = plan.drift
      .map((d) => `V${String(d.version).padStart(3, '0')} (${d.kind} drift: applied=${JSON.stringify(d.applied)} manifest=${JSON.stringify(d.expected)})`)
      .join('; ');
    throw new Error(
      `migration drift detected: applied migration files differ from the manifest — refusing to boot. ${details}`,
    );
  }
  for (const entry of plan.backfill) {
    await pool.query('UPDATE _migrations SET checksum = $1 WHERE version = $2', [entry.checksum, entry.version]);
  }
  const newlyApplied: number[] = [];

  for (const entry of plan.pending) {
    const file = entry.name;
    const version = entry.version;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO _migrations (version, name, checksum) VALUES ($1, $2, $3)",
        [version, file, migrationChecksum(sql)],
      );
      await client.query("COMMIT");
      newlyApplied.push(version);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }
  return { applied: newlyApplied };
};
