/**
 * Real-Postgres proof for V047/V048 and statements/categories (M-10).
 *
 * Runs only with DATABASE_URL_TEST + DB_TEST_MARKER (CI postgres job or a
 * local disposable database); skips otherwise. The db-guard refuses to run
 * against databases without the test marker, and every test cleans up its
 * own household rows.
 *
 * Covers what static review and in-memory tests cannot: legacy duplicate
 * statements/categories converging through the real V047/V048 SQL (with
 * transaction + card_purchase + subcategory references repointed),
 * truly concurrent same-cycle statement writes, a concurrent
 * same-name category race against the V048 unique index, intermediate
 * failure atomicity (no partial rows), migration idempotency, checksum
 * drift detection with diagnosis, and case-folding enforcement.
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
  const ownerId = randomUUID();
  await db.query(`INSERT INTO users (id, email, name, status) VALUES ($1, $2, 'M-10 Owner', 'active')`, [
    ownerId,
    `m10-${id}@example.test`,
  ]);
  await db.query(`INSERT INTO households (id, name, kind, owner_user_id) VALUES ($1, $2, 'shared', $3)`, [
    id,
    name,
    ownerId,
  ]);
  return id;
}

async function cleanupHousehold(db: Pool, id: string): Promise<void> {
  const owner = await db.query(`SELECT owner_user_id FROM households WHERE id = $1`, [id]).catch(() => null);
  await db.query(`DELETE FROM card_purchases WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM transactions WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM statements WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM categories WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM accounts WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM households WHERE id = $1`, [id]).catch(() => undefined);
  const ownerId = owner?.rows[0]?.['owner_user_id'] as string | undefined;
  if (ownerId) await db.query(`DELETE FROM users WHERE id = $1`, [ownerId]).catch(() => undefined);
}

/** Rewind V047/V048 so the next runMigrations re-applies their dedupe. */
async function rewindStatementCategoryMigrations(db: Pool): Promise<void> {
  await db.query(`DROP INDEX IF EXISTS statements_household_account_cycle_uidx`);
  await db.query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx`);
  await db.query(`DELETE FROM _migrations WHERE version IN (47, 48)`);
}

describe('Postgres V047/V048 proof (M-10)', () => {
  beforeAll(async () => {
    if (!DB_URL) return;
    pool = createPool({ connectionString: DB_URL, max: 6 });
    await requireTestDatabase(pool, 'migrate');
    await runMigrations(pool);
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase('V047: legacy duplicate statements converge, references repointed', async () => {
    const db = pool!;
    const householdId = await seedHousehold(db, 'Stmt Dedupe H');
    try {
      const cardRes = await db.query(
        `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status, credit_limit_cents, closing_day, due_day)
         VALUES (gen_random_uuid(), $1, 'Cartao', 'credit_card', 0, 'active', 500000, 15, 25)
         RETURNING id`,
        [householdId],
      );
      const cardId = cardRes.rows[0]!['id'] as string;
      const catRes = await db.query(
        `INSERT INTO categories (id, household_id, name, kind, status) VALUES (gen_random_uuid(), $1, 'Comida', 'expense', 'active') RETURNING id`,
        [householdId],
      );
      const catId = catRes.rows[0]!['id'] as string;

      // Rewind first: with V047/V048 live the duplicates below could not
      // even be inserted (that is the production guarantee); the legacy
      // state is recreated by inserting before the re-apply.
      await rewindStatementCategoryMigrations(db);

      // Legacy duplicates: two statements for the same card + cycle.
      const s1 = (await db.query(
        `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, status)
         VALUES (gen_random_uuid(), $1, $2, '2026-08', '2026-08-15', '2026-08-25', 1000, 'open') RETURNING id`,
        [householdId, cardId],
      )).rows[0]!['id'] as string;
      const s2 = (await db.query(
        `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, status)
         VALUES (gen_random_uuid(), $1, $2, '2026-08', '2026-08-15', '2026-08-25', 2000, 'open') RETURNING id`,
        [householdId, cardId],
      )).rows[0]!['id'] as string;
      const keeper = s1 < s2 ? s1 : s2;
      const loser = keeper === s1 ? s2 : s1;

      const tx1 = (await db.query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, statement_id)
         VALUES (gen_random_uuid(), $1, 'expense', 'A', 1000, '2026-08-10', $2, $3, $4) RETURNING id`,
        [householdId, cardId, catId, s1],
      )).rows[0]!['id'] as string;
      const tx2 = (await db.query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, statement_id)
         VALUES (gen_random_uuid(), $1, 'expense', 'B', 2000, '2026-08-11', $2, $3, $4) RETURNING id`,
        [householdId, cardId, catId, s2],
      )).rows[0]!['id'] as string;
      await db.query(
        `INSERT INTO card_purchases (id, household_id, account_id, statement_id, description, amount_cents, date, category_id)
         VALUES (gen_random_uuid(), $1, $2, $3, 'A', 1000, '2026-08-10', $4),
                (gen_random_uuid(), $1, $2, $5, 'B', 2000, '2026-08-11', $4)`,
        [householdId, cardId, s1, catId, s2],
      );

      const rerun = await runMigrations(db);
      expect(rerun.applied).toEqual(expect.arrayContaining([47, 48]));

      const stmts = await db.query(`SELECT id FROM statements WHERE household_id = $1 AND account_id = $2`, [
        householdId,
        cardId,
      ]);
      expect(stmts.rowCount).toBe(1);
      expect(stmts.rows[0]!['id']).toBe(keeper);
      const txStmt = await db.query(`SELECT DISTINCT statement_id FROM transactions WHERE id IN ($1, $2)`, [tx1, tx2]);
      expect(txStmt.rowCount).toBe(1);
      expect(txStmt.rows[0]!['statement_id']).toBe(keeper);
      const cpStmt = await db.query(
        `SELECT DISTINCT statement_id FROM card_purchases WHERE household_id = $1`,
        [householdId],
      );
      expect(cpStmt.rowCount).toBe(1);
      expect(cpStmt.rows[0]!['statement_id']).toBe(keeper);
      expect(loser).not.toBe(keeper);
      const idx = await db.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'statements_household_account_cycle_uidx'`,
      );
      expect(idx.rowCount).toBe(1);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 60_000);

  itIfDatabase('V048: legacy duplicate categories converge case-insensitively, refs repointed', async () => {
    const db = pool!;
    const writes = createPostgresWriteStore({ pool: db });
    const householdId = await seedHousehold(db, 'Cat Dedupe H');
    try {
      const insertCat = (name: string, kind: string, createdAgo: string, parentId: string | null = null) =>
        db.query(
          `INSERT INTO categories (id, household_id, name, kind, status, parent_id, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, NOW() - $5::interval) RETURNING id`,
          [householdId, name, kind, parentId, createdAgo],
        );
      // Rewind first (see V047 test): duplicates predate the constraint.
      await rewindStatementCategoryMigrations(db);
      // Keeper is the oldest row per (household, kind, parent, lower(name)).
      const keeperMacro = (await insertCat('Comida', 'expense', '3 days')).rows[0]!['id'] as string;
      const loserMacro = (await insertCat('COMIDA', 'expense', '2 days')).rows[0]!['id'] as string;
      const loserMacro2 = (await insertCat('comida', 'expense', '1 day')).rows[0]!['id'] as string;
      const parent = (await insertCat('Casa', 'expense', '3 days')).rows[0]!['id'] as string;
      const keeperSub = (await insertCat('Aluguel', 'expense', '3 days', parent)).rows[0]!['id'] as string;
      const loserSub = (await insertCat('ALUGUEL', 'expense', '1 day', parent)).rows[0]!['id'] as string;
      const acc = await writes.createAccount(householdId, { name: 'A', kind: 'bank', initialBalanceCents: 100_000 });

      const txMacro = (await db.query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id)
         VALUES (gen_random_uuid(), $1, 'expense', 'm', 1000, '2026-09-01', $2, $3) RETURNING id`,
        [householdId, acc.id, loserMacro],
      )).rows[0]!['id'] as string;
      const txSub = (await db.query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id)
         VALUES (gen_random_uuid(), $1, 'expense', 's', 2000, '2026-09-01', $2, $3, $4) RETURNING id`,
        [householdId, acc.id, parent, loserSub],
      )).rows[0]!['id'] as string;

      await rewindStatementCategoryMigrations(db);
      const rerun = await runMigrations(db);
      expect(rerun.applied).toEqual(expect.arrayContaining([48]));

      const active = await db.query(
        `SELECT id, name, status FROM categories
          WHERE household_id = $1 AND kind = 'expense' AND parent_id IS NULL AND lower(name) = 'comida'`,
        [householdId],
      );
      expect(active.rows.filter((r) => r['status'] === 'active')).toHaveLength(1);
      expect(active.rows.find((r) => r['status'] === 'active')!['id']).toBe(keeperMacro);
      const loserRows = await db.query(`SELECT status FROM categories WHERE id IN ($1, $2)`, [loserMacro, loserMacro2]);
      expect(loserRows.rows.every((r) => r['status'] === 'inactive')).toBe(true);

      const txMacroAfter = await db.query(`SELECT category_id FROM transactions WHERE id = $1`, [txMacro]);
      expect(txMacroAfter.rows[0]!['category_id']).toBe(keeperMacro);
      const txSubAfter = await db.query(`SELECT subcategory_id FROM transactions WHERE id = $1`, [txSub]);
      expect(txSubAfter.rows[0]!['subcategory_id']).toBe(keeperSub);

      const idx = await db.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'categories_household_kind_parent_name_uidx'`,
      );
      expect(idx.rowCount).toBe(1);

      // Case-folding is now enforced: a folded duplicate cannot be created.
      await expect(writes.createCategory(householdId, { name: 'cOmIdA', kind: 'expense' })).rejects.toThrow();
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 60_000);

  itIfDatabase('concurrent same-cycle purchases share one statement', async () => {
    const db = pool!;
    const writes = createPostgresWriteStore({ pool: db });
    const cards = createPostgresCardStore(db);
    const householdId = await seedHousehold(db, 'Stmt Race H');
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
          accountId: cardId, description: 'A', amountCents: 1000, date: '2026-08-20', categoryId: cat.id,
        }),
        cards.createCardPurchase(householdId, {
          accountId: cardId, description: 'B', amountCents: 2000, date: '2026-08-21', categoryId: cat.id,
        }),
      ]);
      expect(r1).toHaveLength(1);
      expect(r2).toHaveLength(1);
      const stmts = await db.query(`SELECT id FROM statements WHERE household_id = $1 AND account_id = $2`, [
        householdId,
        cardId,
      ]);
      expect(stmts.rowCount).toBe(1);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 60_000);

  itIfDatabase('concurrent same-name category creation leaves exactly one active row', async () => {
    const db = pool!;
    const writes = createPostgresWriteStore({ pool: db });
    const householdId = await seedHousehold(db, 'Cat Race H');
    try {
      const results = await Promise.allSettled([
        writes.createCategory(householdId, { name: 'Lazer', kind: 'expense' }),
        writes.createCategory(householdId, { name: 'LAZER', kind: 'expense' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const rows = await db.query(
        `SELECT COUNT(*)::int AS n FROM categories
          WHERE household_id = $1 AND lower(name) = 'lazer' AND status = 'active' AND deleted_at IS NULL`,
        [householdId],
      );
      expect(rows.rows[0]!['n']).toBe(1);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 60_000);

  itIfDatabase('intermediate failure leaves no partial rows; rerun is a no-op', async () => {
    const db = pool!;
    const _writes = createPostgresWriteStore({ pool: db });
    const cards = createPostgresCardStore(db);
    const householdId = await seedHousehold(db, 'Atomic H');
    try {
      const cardRes = await db.query(
        `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status, credit_limit_cents, closing_day, due_day)
         VALUES (gen_random_uuid(), $1, 'Nubank', 'credit_card', 0, 'active', 500000, 15, 25)
         RETURNING id`,
        [householdId],
      );
      const cardId = cardRes.rows[0]!['id'] as string;
      await expect(
        cards.createCardPurchase(householdId, {
          accountId: cardId, description: 'Ghost', amountCents: 1000, date: '2026-08-20', categoryId: randomUUID(),
        }),
      ).rejects.toThrow();
      const leftovers = await db.query(
        `SELECT
           (SELECT COUNT(*)::int FROM statements WHERE household_id = $1) AS statements,
           (SELECT COUNT(*)::int FROM transactions WHERE household_id = $1) AS transactions,
           (SELECT COUNT(*)::int FROM card_purchases WHERE household_id = $1) AS purchases`,
        [householdId],
      );
      expect(leftovers.rows[0]).toMatchObject({ statements: 0, transactions: 0, purchases: 0 });

      // Raw rollback proof: an aborted transaction persists nothing.
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO categories (household_id, name, kind, status) VALUES ($1, 'RolledBack', 'expense', 'active')`,
          [householdId],
        );
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const rolled = await db.query(`SELECT COUNT(*)::int AS n FROM categories WHERE household_id = $1`, [householdId]);
      expect(rolled.rows[0]!['n']).toBe(0);

      const rerun = await runMigrations(db);
      expect(rerun.applied).toEqual([]);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 60_000);

  itIfDatabase('checksum drift after apply aborts with a diagnosis', async () => {
    const db = pool!;
    const householdId = await seedHousehold(db, 'Drift H');
    try {
      const before = await db.query(`SELECT checksum FROM _migrations WHERE version = 47`);
      expect(before.rowCount).toBe(1);
      const original = before.rows[0]!['checksum'] as string;
      await db.query(`UPDATE _migrations SET checksum = 'tampered' WHERE version = 47`);
      try {
        await expect(runMigrations(db)).rejects.toThrow(/migration drift detected/);
        await expect(runMigrations(db)).rejects.toThrow(/V047/);
      } finally {
        await db.query(`UPDATE _migrations SET checksum = $1 WHERE version = 47`, [original]);
      }
      const healed = await runMigrations(db);
      expect(healed.applied).toEqual([]);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 60_000);
});
