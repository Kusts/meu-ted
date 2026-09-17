#!/usr/bin/env tsx
/**
 * Phase 0.4.6 — Explicit migration job.
 *
 * Usage: DB_MIGRATION_MODE=apply tsx src/scripts/migrate-job.ts
 *
 * Must have DB_TEST_MARKER or DATABASE_URL_TEST set to run.
 * Uses advisory lock to prevent concurrent runs.
 * Creates a backup marker before applying migrations.
 */

import { createMigrationPool } from '../db/pool.js';
import { runMigrations } from '../read-models/sql/migrate.js';
import { requireTestDatabase } from '../db/db-guard.js';
import { isBackupGateSatisfied, withMigrationAdvisoryLock } from './migration-job-policy.js';

const main = async (): Promise<void> => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    console.error('FATAL: DATABASE_URL is required.');
    process.exit(1);
  }
  if (!isBackupGateSatisfied(process.env)) {
    console.error('FATAL: BACKUP_CONFIRMED=true and BACKUP_ID are required.');
    process.exit(1);
  }

  const pool = createMigrationPool({ connectionString: databaseUrl });

  try {
    // Local runs require the server-side test marker. Production runs are
    // explicitly authorized by BACKUP_CONFIRMED/BACKUP_ID instead.
    if (process.env.NODE_ENV !== 'production') {
      await requireTestDatabase(pool, 'migrate-job');
    }

    await withMigrationAdvisoryLock(pool, async () => {
      console.log('Acquired advisory lock pi-finance:migrations.');
        // Record the externally supplied backup evidence before applying.
        await pool.query(
          `CREATE TABLE IF NOT EXISTS _migration_backup_marker (
            id SERIAL PRIMARY KEY,
            backup_id TEXT NOT NULL,
            ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ran_by TEXT NOT NULL DEFAULT current_user
          )`,
        );
        await pool.query('ALTER TABLE _migration_backup_marker ADD COLUMN IF NOT EXISTS backup_id TEXT');
        await pool.query(
          `INSERT INTO _migration_backup_marker (backup_id) VALUES ($1)`,
          [process.env.BACKUP_ID!.trim()],
        );
        console.log(`Backup marker recorded: ${process.env.BACKUP_ID!.trim()}.`);

        // Apply migrations (outer advisory lock already held — the inner
        // runner must not re-acquire on a second session).
        const isLegacy = process.env.DB_SCHEMA === 'legacy';
        const result = await runMigrations(pool, isLegacy, { withLock: false });
        console.log(`Migrations applied: ${result.applied.length > 0 ? result.applied.join(', ') : 'none (up to date)'}.`);
    });
    console.log('Advisory lock released.');
  } catch (err) {
    console.error('Migration failed:', (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

void main();
