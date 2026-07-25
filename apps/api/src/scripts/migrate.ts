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
import { runMigrations } from '../read-models/sql/migrate.js';

const main = async (): Promise<void> => {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    process.stderr.write('DATABASE_URL is not set; nothing to do.\n');
    process.exit(1);
  }
  const pool = createPool({ connectionString: cfg.databaseUrl });
  try {
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
