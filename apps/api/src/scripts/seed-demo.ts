/**
 * One-off: insert the in-memory DEMO seed into the configured database,
 * so the HTTP server can be smoke-tested against Postgres with realistic
 * data.
 */
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_TRANSACTIONS, DEMO_HOUSEHOLD_ID } from '../read-models/demo-data.js';
import { createPool } from '../db/pool.js';
import { loadConfig } from '../env.js';

const main = async (): Promise<void> => {
  const cfg = loadConfig();
  if (!cfg.databaseUrl) {
    process.stderr.write('DATABASE_URL is not set.\n');
    process.exit(1);
  }
  const pool = createPool({ connectionString: cfg.databaseUrl });
  try {
    await pool.query('TRUNCATE TABLE accounts, categories, transactions, device_tokens RESTART IDENTITY CASCADE');

    for (const a of DEMO_ACCOUNTS) {
      await pool.query(
        `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [a.id, a.householdId, a.name, a.kind, a.balanceCents, a.status],
      );
    }
    for (const c of DEMO_CATEGORIES) {
      await pool.query(
        `INSERT INTO categories (id, household_id, name, kind, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [c.id, c.householdId, c.name, c.kind, c.status],
      );
    }
    for (const t of DEMO_TRANSACTIONS) {
      await pool.query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [t.id, t.householdId, t.kind, t.description, t.amountCents, t.date, t.accountId, t.categoryId ?? null, t.transferToAccountId ?? null],
      );
    }
    // Seed the V1 demo device token so the HTTP path accepts it.
    await pool.query(
      `INSERT INTO device_tokens (token, device_id, household_id)
       VALUES ('dev-token-1', 'dev-device-1', $1)`,
      [DEMO_HOUSEHOLD_ID],
    );

    process.stdout.write(
      `Seeded ${DEMO_ACCOUNTS.length} accounts, ${DEMO_CATEGORIES.length} categories, ${DEMO_TRANSACTIONS.length} transactions, 1 device_token\n`,
    );
  } finally {
    await pool.end();
  }
};

void main().catch((err) => {
  process.stderr.write(`seed-demo failed: ${(err as Error).message}\n`);
  process.exit(1);
});
