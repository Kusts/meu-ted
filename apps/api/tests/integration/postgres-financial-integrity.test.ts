/**
 * Real-Postgres financial integrity tests (C-04, H-04, M-02).
 *
 * Runs only with DATABASE_URL_TEST + DB_TEST_MARKER (CI postgres job or a
 * local disposable database); skips otherwise. The db-guard refuses to run
 * against databases without the test marker, and every test cleans up its
 * own household rows.
 *
 * Covers what unit tests cannot: real SQL execution of the cascade balance
 * reversal, true concurrent statement creation (two connections racing on
 * the V047 unique index), and concurrent default-catalog application.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import { createPostgresWriteStore } from '../../src/writes/postgres.js';
import { createPostgresCardStore } from '../../src/cards/postgres.js';
import type { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

const newHousehold = () => randomUUID();

async function seedHousehold(db: Pool, name: string): Promise<string> {
  const id = newHousehold();
  await db.query(`INSERT INTO households (id, name, kind) VALUES ($1, $2, 'shared')`, [id, name]);
  return id;
}

async function cleanupHousehold(db: Pool, id: string): Promise<void> {
  await db.query(`DELETE FROM card_purchases WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM transactions WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM statements WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM categories WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM accounts WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM households WHERE id = $1`, [id]).catch(() => undefined);
}

describe('Postgres financial integrity (C-04, H-04, M-02)', () => {
  beforeAll(async () => {
    if (!DB_URL) return;
    pool = createPool({ connectionString: DB_URL, max: 4 });
    await requireTestDatabase(pool, 'migrate');
    await runMigrations(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase('C-04: cascade restores expense and income balances', async () => {
    const db = pool!;
    const writes = createPostgresWriteStore({ pool: db });
    const householdId = await seedHousehold(db, 'Cascade H');
    try {
      const acc = await writes.createAccount(householdId, { name: 'A', kind: 'bank', initialBalanceCents: 10_000 });
      const food = await writes.createCategory(householdId, { name: 'Food', kind: 'expense' });
      const salary = await writes.createCategory(householdId, { name: 'Salary', kind: 'income' });
      await writes.createExpense(householdId, {
        description: 'Lunch', amountCents: 1000, date: '2026-06-10',
        accountId: acc.id, categoryId: food.id,
      });
      await writes.createIncome(householdId, {
        description: 'Pay', amountCents: 500, date: '2026-06-10',
        accountId: acc.id, categoryId: salary.id,
      });
      const before = await db.query(`SELECT balance_cents FROM accounts WHERE id = $1`, [acc.id]);
      expect(Number(before.rows[0]!['balance_cents'])).toBe(9500);

      const res = await writes.deleteCategory(householdId, food.id, { mode: 'cascade', confirm: true });
      expect(res.softDeletedTransactions).toBe(1);
      const after = await db.query(`SELECT balance_cents FROM accounts WHERE id = $1`, [acc.id]);
      expect(Number(after.rows[0]!['balance_cents'])).toBe(10_500);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 30_000);

  itIfDatabase('H-04: concurrent same-cycle purchases share one statement', async () => {
    const db = pool!;
    const writes = createPostgresWriteStore({ pool: db });
    const cards = createPostgresCardStore(db);
    const householdId = await seedHousehold(db, 'Race H');
    try {
      const cat = await writes.createCategory(householdId, { name: 'Food', kind: 'expense' });
      const cardRes = await db.query(
        `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status, credit_limit_cents, closing_day, due_day)
         VALUES (gen_random_uuid(), $1, 'Nubank', 'credit_card', 0, 'active', 500000, 15, 25)
         RETURNING id`,
        [householdId],
      );
      const cardId = cardRes.rows[0]!['id'] as string;
      const [r1, r2] = await Promise.all([
        cards.createCardPurchase(householdId, {
          accountId: cardId, description: 'A', amountCents: 1000,
          date: '2026-08-20', categoryId: cat.id,
        }),
        cards.createCardPurchase(householdId, {
          accountId: cardId, description: 'B', amountCents: 2000,
          date: '2026-08-21', categoryId: cat.id,
        }),
      ]);
      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);
      const stmts = await db.query(
        `SELECT id FROM statements WHERE household_id = $1 AND account_id = $2`,
        [householdId, cardId],
      );
      expect(stmts.rowCount).toBe(1);
      const linked = await db.query(
        `SELECT COUNT(*)::int AS n FROM transactions WHERE household_id = $1 AND statement_id = $2 AND deleted_at IS NULL`,
        [householdId, stmts.rows[0]!['id']],
      );
      expect(linked.rows[0]!['n']).toBe(2);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 30_000);

  itIfDatabase('M-02: concurrent applyDefaults converges without duplicates', async () => {
    const db = pool!;
    const writes = createPostgresWriteStore({ pool: db });
    const householdId = await seedHousehold(db, 'Defaults H');
    try {
      const [first, second] = await Promise.all([
        writes.applyCategoryDefaults(householdId),
        writes.applyCategoryDefaults(householdId),
      ]);
      expect(first.created + first.skipped).toBeGreaterThan(0);
      expect(second.created + second.skipped).toBe(first.created + first.skipped);
      const dupes = await db.query(
        `SELECT household_id, kind, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) AS parent, lower(name) AS name, COUNT(*) AS n
           FROM categories
          WHERE household_id = $1 AND status = 'active' AND deleted_at IS NULL
          GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1`,
        [householdId],
      );
      expect(dupes.rowCount).toBe(0);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 30_000);
});
