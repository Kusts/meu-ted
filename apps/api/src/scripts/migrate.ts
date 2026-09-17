/**
 * Stand-alone migration runner script.
 *
 *   pnpm db:migrate
 *
 * Reads DATABASE_URL from the environment, applies pending migrations,
 * prints the result, and exits. Safe to run repeatedly.
 */

import { loadConfig } from '../env.js';
import { createPool } from '../db/pool.js';
import { runMigrations, validateMigrations } from '../read-models/sql/migrate.js';

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const validateOnly = args.includes('--validate') || args.includes('--dry-run');
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    process.stderr.write('DATABASE_URL is not set; nothing to do.\n');
    process.exit(1);
  }
  const pool = createPool({ connectionString: cfg.databaseUrl });
  try {
    if (validateOnly) {
      // V4.1 Phase 9 (Task 9.5): read-only validation — plans drift/pending,
      // applies nothing, backfills nothing. Throws on non-baseline drift.
      const plan = await validateMigrations(pool);
      process.stdout.write(
        `Migration validation OK: ${plan.pending.length} pending, ` +
          `${plan.drift.length} drift, ${plan.baselineDrift.length} baseline-drift (known, warn-only), ` +
          `${plan.backfill.length} checksum backfill candidate(s, not applied in validate mode).\n`,
      );
      if (plan.pending.length > 0) {
        process.stdout.write(
          `Pending: ${plan.pending.map((m) => `V${String(m.version).padStart(3, '0')}`).join(', ')}\n`,
        );
      }
      return;
    }
    const result = await runMigrations(pool);
    if (result.applied.length === 0) {
      process.stdout.write('No pending migrations.\n');
    } else {
      process.stdout.write(
        `Applied ${result.applied.length} migration(s): ${result.applied
          .map((v) => `V${String(v).padStart(3, '0')}`)
          .join(', ')}\n`,
      );
    }
  } finally {
    await pool.end();
  }
};

void main().catch((err) => {
  process.stderr.write(`Migration failed: ${(err as Error).message}\n`);
  process.exit(1);
});
