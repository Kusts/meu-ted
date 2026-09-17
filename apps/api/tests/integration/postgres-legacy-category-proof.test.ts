/**
 * Real-Postgres proof for legacy category uniqueness (V049, M-02 on VPS).
 *
 * Runs only with DATABASE_URL_TEST + DB_TEST_MARKER; skips otherwise.
 * The VPS boots with DB_SCHEMA=legacy against a categories table shaped
 * with an `active` boolean and NO `status` column. This file proves:
 *  (a) legacy-mode boot applies pending V044..V049 in order, skipping V048;
 *  (b) V049 dedupes legacy duplicates, re-points transaction + subcategory
 *      references to the keeper and deactivates losers (history preserved);
 *  (c) two concurrent legacy creations of the same category converge on one
 *      live row through the new unique index (upsert + reuse);
 *  (d) on the canonical schema V049 is a no-op and the V048 index remains.
 *
 * Test order matters: (d) asserts the pristine canonical state first, then
 * the file converts to the legacy shape (idempotent helper) for (b)/(c).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import { createLegacyPostgresWriteStore } from '../../src/writes/legacy-postgres.js';
import type { Pool } from 'pg';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

async function seedHousehold(db: Pool, name: string): Promise<string> {
  const id = randomUUID();
  const ownerId = randomUUID();
  await db.query(`INSERT INTO users (id, email, name, status) VALUES ($1, $2, 'V49 Owner', 'active')`, [
    ownerId,
    `v49-${id}@example.test`,
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
  await db.query(`DELETE FROM transactions WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM categories WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM accounts WHERE household_id = $1`, [id]).catch(() => undefined);
  await db.query(`DELETE FROM households WHERE id = $1`, [id]).catch(() => undefined);
  const ownerId = owner?.rows[0]?.['owner_user_id'] as string | undefined;
  if (ownerId) await db.query(`DELETE FROM users WHERE id = $1`, [ownerId]).catch(() => undefined);
}

async function rewindRecent(db: Pool): Promise<void> {
  await db.query(`DROP INDEX IF EXISTS statements_household_account_cycle_uidx`);
  await db.query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx`);
  await db.query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx_legacy`);
  await db.query(`DELETE FROM _migrations WHERE version IN (44, 45, 46, 47, 48, 49)`);
}

/** Idempotent conversion to the VPS legacy categories shape (active boolean, no `status`). */
async function convertToLegacyShape(db: Pool): Promise<void> {
  await db.query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx`);
  await db.query(`DROP INDEX IF EXISTS categories_household_status_idx`);
  await db.query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx_legacy`);
  await db.query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true`);
  const hasStatus = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'status'`,
  );
  if ((hasStatus.rowCount ?? 0) > 0) {
    await db.query(`UPDATE categories SET active = (status = 'active')`);
    await db.query(`ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_status_check`);
    await db.query(`ALTER TABLE categories DROP COLUMN status`);
  }
  await db.query(`DELETE FROM _migrations WHERE version IN (48, 49)`);
}

/** Restore the canonical categories shape (status column back). Idempotent. */
async function restoreCanonicalShape(db: Pool): Promise<void> {
  const cols = await db.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'categories'`,
  );
  const names = new Set(cols.rows.map((row) => row['column_name'] as string));
  if (!names.has('status')) {
    await db.query(`ALTER TABLE categories ADD COLUMN status TEXT`);
    if (names.has('active')) {
      await db.query(`UPDATE categories SET status = CASE WHEN active = true THEN 'active' ELSE 'inactive' END`);
    } else {
      await db.query(`UPDATE categories SET status = 'active'`);
    }
    await db.query(`ALTER TABLE categories ALTER COLUMN status SET NOT NULL`);
    await db.query(
      `ALTER TABLE categories ADD CONSTRAINT categories_status_check CHECK (status IN ('active', 'inactive'))`,
    );
  }
}

describe('Postgres legacy category uniqueness (V049)', () => {
  beforeAll(async () => {
    if (!DB_URL) return;
    pool = createPool({ connectionString: DB_URL, max: 4 });
    await requireTestDatabase(pool, 'migrate');
    // Deterministic start on a reused database: canonical shape + full
    // migrate (previous runs may have left the legacy shape behind).
    await restoreCanonicalShape(pool);
    await rewindRecent(pool);
    await runMigrations(pool);
  }, 180_000);

  afterAll(async () => {
    // Leave the SHARED database canonical: sibling files running after this
    // one (vitest file order is not guaranteed) need categories.status for
    // V048, _migrations 48/49 present, and no legacy unique index behind.
    // Re-applying is idempotent.
    if (pool) {
      await restoreCanonicalShape(pool).catch(() => undefined);
      await pool
        .query(`DROP INDEX IF EXISTS categories_household_kind_parent_name_uidx_legacy`)
        .catch(() => undefined);
      await runMigrations(pool).catch(() => undefined);
    }
    await pool?.end();
  });

  itIfDatabase('canonical mode: V049 is a no-op and the V048 index remains', async () => {
    const db = pool!;
    const v49 = await db.query(`SELECT version FROM _migrations WHERE version = 49`);
    expect(v49.rowCount).toBe(1);
    const idx = await db.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'categories' AND indexname IN
        ('categories_household_kind_parent_name_uidx', 'categories_household_kind_parent_name_uidx_legacy')`,
    );
    const names = idx.rows.map((row) => row['indexname'] as string);
    expect(names).toContain('categories_household_kind_parent_name_uidx');
    expect(names).not.toContain('categories_household_kind_parent_name_uidx_legacy');
    const rerun = await runMigrations(db);
    expect(rerun.applied).toEqual([]);
  }, 120_000);

  itIfDatabase('legacy-mode boot applies pending V044..V049 in order, skipping V048', async () => {
    const db = pool!;
    await rewindRecent(db);
    // Exact VPS boot call (DB_SCHEMA=legacy).
    const result = await runMigrations(db, true);
    expect(result.applied).toEqual([44, 45, 46, 47, 49]);
    const v48 = await db.query(`SELECT version FROM _migrations WHERE version = 48`);
    expect(v48.rowCount).toBe(0);
    // Canonical follow-up still picks up V048 afterwards (no interference).
    const followUp = await runMigrations(db);
    expect(followUp.applied).toEqual([48]);
  }, 180_000);

  itIfDatabase('V049 dedupes legacy duplicates, re-points refs, deactivates losers', async () => {
    const db = pool!;
    await convertToLegacyShape(db);
    const householdId = await seedHousehold(db, 'Legacy Dedupe H');
    try {
      const insertCat = (name: string, active: boolean, parentId: string | null = null) =>
        db.query(
          `INSERT INTO categories (id, household_id, name, kind, active, parent_id)
           VALUES (gen_random_uuid(), $1, $2, 'expense', $3, $4) RETURNING id`,
          [householdId, name, active, parentId],
        );
      const c1 = (await insertCat('Comida', true)).rows[0]!['id'] as string;
      const c2 = (await insertCat('COMIDA', true)).rows[0]!['id'] as string;
      const c3 = (await insertCat('comida', true)).rows[0]!['id'] as string;
      const keeper = [c1, c2, c3].sort()[0]!;
      const parent = (await insertCat('Casa', true)).rows[0]!['id'] as string;
      const s1 = (await insertCat('Aluguel', true, parent)).rows[0]!['id'] as string;
      const s2 = (await insertCat('ALUGUEL', true, parent)).rows[0]!['id'] as string;
      const keeperSub = s1 < s2 ? s1 : s2;
      const acc = (await db.query(
        `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
         VALUES (gen_random_uuid(), $1, 'Conta', 'bank', 0, 'active') RETURNING id`,
        [householdId],
      )).rows[0]!['id'] as string;
      const txMacro = (await db.query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id)
         VALUES (gen_random_uuid(), $1, 'expense', 'm', 1000, '2026-09-01', $2, $3) RETURNING id`,
        [householdId, acc, c1 === keeper ? c2 : c1],
      )).rows[0]!['id'] as string;
      const txSub = (await db.query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id)
         VALUES (gen_random_uuid(), $1, 'expense', 's', 2000, '2026-09-01', $2, $3, $4) RETURNING id`,
        [householdId, acc, parent, keeperSub === s1 ? s2 : s1],
      )).rows[0]!['id'] as string;

      const result = await runMigrations(db, true);
      expect(result.applied).toContain(49);

      const live = await db.query(
        `SELECT id, active FROM categories
          WHERE household_id = $1 AND kind = 'expense' AND parent_id IS NULL AND lower(name) = 'comida'`,
        [householdId],
      );
      expect(live.rows.filter((r) => r['active'] === true)).toHaveLength(1);
      expect(live.rows.find((r) => r['active'] === true)!['id']).toBe(keeper);
      expect(live.rows.filter((r) => r['active'] === false)).toHaveLength(2);

      const txMacroAfter = await db.query(`SELECT category_id FROM transactions WHERE id = $1`, [txMacro]);
      expect(txMacroAfter.rows[0]!['category_id']).toBe(keeper);
      const txSubAfter = await db.query(`SELECT subcategory_id FROM transactions WHERE id = $1`, [txSub]);
      expect(txSubAfter.rows[0]!['subcategory_id']).toBe(keeperSub);

      const idx = await db.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'categories_household_kind_parent_name_uidx_legacy'`,
      );
      expect(idx.rowCount).toBe(1);
      // Idempotent: a second legacy boot changes nothing.
      const rerun = await runMigrations(db, true);
      expect(rerun.applied).toEqual([]);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 180_000);

  itIfDatabase('concurrent legacy creations of the same category converge on one live row', async () => {
    const db = pool!;
    await convertToLegacyShape(db);
    await runMigrations(db, true);
    const writes = createLegacyPostgresWriteStore({ pool: db });
    const householdId = await seedHousehold(db, 'Legacy Race H');
    try {
      const [r1, r2] = await Promise.all([
        writes.createCategory(householdId, { name: 'Lazer', kind: 'expense' }),
        writes.createCategory(householdId, { name: 'LAZER', kind: 'expense' }),
      ]);
      // Reuse semantics: both calls succeed with the same surviving row.
      expect(r1.id).toBe(r2.id);
      const rows = await db.query(
        `SELECT COUNT(*)::int AS n FROM categories
          WHERE household_id = $1 AND lower(name) = 'lazer' AND active = true`,
        [householdId],
      );
      expect(rows.rows[0]!['n']).toBe(1);
    } finally {
      await cleanupHousehold(db, householdId);
    }
  }, 120_000);
});
