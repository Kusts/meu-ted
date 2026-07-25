/**
 * One-off: create pi_finance_api_test database on the local Postgres
 * server. Idempotent: if the database already exists, does nothing.
 *
 *   pnpm tsx src/scripts/create-test-db.ts
 */
import pg from 'pg';
import { loadConfig } from '../env.js';

const main = async (): Promise<void> => {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    process.stderr.write('DATABASE_URL is not set.\n');
    process.exit(1);
  }
  // Connect to the maintenance DB "postgres" to create a new DB.
  const adminUrl = cfg.databaseUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const dbName = 'pi_finance_api_test';
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (exists.rowCount === 0) {
      await admin.query(`CREATE DATABASE ${dbName}`);
      process.stdout.write(`Created database ${dbName}\n`);
    } else {
      process.stdout.write(`Database ${dbName} already exists\n`);
    }
  } finally {
    await admin.end();
  }
};

void main().catch((err) => {
  process.stderr.write(`create-test-db failed: ${(err as Error).message}\n`);
  process.exit(1);
});
