/**
 * One-off: drop pi_finance_api_test database on the local Postgres
 * server. Useful when migrations need to be re-applied from scratch.
 */
import pg from 'pg';
import { loadConfig } from '../env.js';

const main = async (): Promise<void> => {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    process.stderr.write('DATABASE_URL is not set.\n');
    process.exit(1);
  }
  const adminUrl = cfg.databaseUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    const dbName = 'pi_finance_api_test';
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [dbName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    process.stdout.write(`Dropped database ${dbName}\n`);
  } finally {
    await admin.end();
  }
};

void main().catch((err) => {
  process.stderr.write(`drop-test-db failed: ${(err as Error).message}\n`);
  process.exit(1);
});
