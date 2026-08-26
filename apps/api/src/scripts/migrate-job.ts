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

import { createPool } from '../db/pool.js';
import { runMigrations } from '../read-models/sql/migrate.js';
import { requireTestDatabase } from '../db/db-guard.js';
import { isBackupGateSatisfied } from './migration-job-policy.js';

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

  const pool = createPool({ connectionString: databaseUrl });

  try {
    // Phase 0.2: validate test database marker before any destructive op
    await requireTestDatabase(pool, 'migrate-job');

    // Phase 0.4.6: acquire a stable advisory lock to prevent concurrent runs.
    const lockClient = await pool.connect();
    try {
      const lockResult = await lockClient.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_lock(hashtextextended('pi-finance:migrations', 0)) AS locked`,
      );
      if (!lockResult.rows[0]?.locked) {
        console.error('Migration already in progress (advisory lock 42). Exiting.');
        process.exit(1);
      }
      console.log('Acquired advisory lock pi-finance:migrations.');

      try {
        // Record the externally supplied backup evidence before applying.
        await lockClient.query(
          `CREATE TABLE IF NOT EXISTS _migration_backup_marker (
            id SERIAL PRIMARY KEY,
            backup_id TEXT NOT NULL,
            ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ran_by TEXT NOT NULL DEFAULT current_user
          )`,
        );
        await lockClient.query('ALTER TABLE _migration_backup_marker ADD COLUMN IF NOT EXISTS backup_id TEXT');
        await lockClient.query(
          `INSERT INTO _migration_backup_marker (backup_id) VALUES ($1)`,
          [process.env.BACKUP_ID!.trim()],
        );
        console.log(`Backup marker recorded: ${process.env.BACKUP_ID!.trim()}.`);

        // Apply migrations
        const isLegacy = process.env.DB_SCHEMA === 'legacy';
        const result = await runMigrations(pool, isLegacy);
        console.log(`Migrations applied: ${result.applied.length > 0 ? result.applied.join(', ') : 'none (up to date)'}.`);
      } finally {
        // Release advisory lock
        const unlockResult = await lockClient.query<{ unlocked: boolean }>(
          `SELECT pg_advisory_unlock(hashtextextended('pi-finance:migrations', 0)) AS unlocked`,
        );
        console.log(`Advisory lock released: ${unlockResult.rows[0]?.unlocked}.`);
      }
    } finally {
      lockClient.release();
    }
  } catch (err) {
    console.error('Migration failed:', (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

void main();
