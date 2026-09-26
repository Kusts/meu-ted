import type { DbPool } from '../db/pool.js';
import {
  expectedMigrationManifest,
  MIGRATION_DRIFT_BASELINE_VERSION,
  normalizeStoredChecksum,
} from '../read-models/sql/migrate.js';

type SchemaColumn = { table: string; column: string };

const SHARED_REQUIRED_COLUMNS: SchemaColumn[] = [
  { table: '_migrations', column: 'version' },
  { table: 'accounts', column: 'id' },
  { table: 'accounts', column: 'household_id' },
  { table: 'categories', column: 'id' },
  { table: 'categories', column: 'household_id' },
  { table: 'transactions', column: 'id' },
  { table: 'transactions', column: 'household_id' },
  { table: 'device_tokens', column: 'token' },
  { table: 'device_tokens', column: 'household_id' },
  { table: 'operation_records', column: 'id' },
  { table: 'operation_records', column: 'workspace_id' },
  { table: 'operation_records', column: 'actor_type' },
  { table: 'operation_records', column: 'actor_id' },
  { table: 'operation_records', column: 'status' },
  { table: 'operation_records', column: 'lease_until' },
  { table: 'operation_records', column: 'retry_until' },
  { table: 'operation_records', column: 'retention_until' },
];

const CANONICAL_REQUIRED_COLUMNS: SchemaColumn[] = [
  ...SHARED_REQUIRED_COLUMNS,
  { table: 'audit_logs', column: 'operation_record_id' },
  { table: 'audit_logs', column: 'workspace_id' },
  { table: 'audit_logs', column: 'actor_type' },
  { table: 'audit_logs', column: 'actor_id' },
  { table: 'audit_logs', column: 'event_type' },
  // V058 anchor for the canonical balance reconciliation (M3 converter):
  // balance_cents == initial_balance_cents + movements. Fail-closed after
  // the cutover: a canonical database without the anchor cannot reconcile.
  { table: 'accounts', column: 'initial_balance_cents' },
];

const LEGACY_REQUIRED_COLUMNS: SchemaColumn[] = [
  ...SHARED_REQUIRED_COLUMNS,
  { table: 'audit_logs', column: 'id' },
  { table: 'audit_logs', column: 'household_id' },
  { table: 'audit_logs', column: 'user_id' },
  { table: 'audit_logs', column: 'action' },
  { table: 'audit_logs', column: 'entity_type' },
  { table: 'audit_logs', column: 'entity_id' },
  { table: 'audit_logs', column: 'before_json' },
  { table: 'audit_logs', column: 'after_json' },
];

/** Read-only schema fingerprint used by the web process; never creates objects. */
export const verifySchema = async (pool: DbPool, legacy = false): Promise<boolean> => {
  const required = legacy ? LEGACY_REQUIRED_COLUMNS : CANONICAL_REQUIRED_COLUMNS;
  try {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [Array.from(new Set(required.map(({ table }) => table)))],
    );
    const actual = new Set(result.rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`));
    if (!required.every(({ table, column }) => actual.has(`${table}.${column}`))) return false;

    const migrationResult = await pool.query<{ version: number; name: string; checksum: string | null }>(
      'SELECT version, name, checksum FROM _migrations ORDER BY version',
    );
    const expected = expectedMigrationManifest(legacy);
    // Era-aware verification: pre-guard production history (version <
    // MIGRATION_DRIFT_BASELINE_VERSION) carries documented checksum drift and
    // is tolerated with the same policy as the migration job's guard
    // (docs/ops/migration-drift-baseline.md). Guarded-era versions (>=
    // baseline) must match exactly, and no unexpected guarded-era ledger row
    // may exist. This keeps the web verify consistent with the apply-time
    // guard instead of duplicating a stricter policy.
    const ledgerByVersion = new Map(migrationResult.rows.map((row) => [row.version, row]));
    for (const migration of expected) {
      const applied = ledgerByVersion.get(migration.version);
      if (!applied) {
        if (migration.version >= MIGRATION_DRIFT_BASELINE_VERSION) return false;
        continue;
      }
      if (applied.name !== migration.name) return false;
      if (normalizeStoredChecksum(applied.checksum) !== normalizeStoredChecksum(migration.checksum)) {
        if (migration.version >= MIGRATION_DRIFT_BASELINE_VERSION) return false;
      }
    }
    const expectedVersions = new Set(expected.map((migration) => migration.version));
    return !migrationResult.rows.some(
      (row) => row.version >= MIGRATION_DRIFT_BASELINE_VERSION && !expectedVersions.has(row.version),
    );
  } catch {
    return false;
  }
};
