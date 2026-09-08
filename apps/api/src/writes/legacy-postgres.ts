/**
 * Legacy Postgres write store.
 *
 * Writes to the existing pi_financeiro schema.
 * - transactions use from_account_id / to_account_id
 * - accounts have initial_balance_cents / active boolean
 * - categories have active boolean
 * - soft-delete via deleted_at = NOW()
 * - balances are computed (no stored balance_cents update on write)
 */

import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Account, Category, Transaction } from '../types/domain.js';
import { DEFAULT_CATEGORY_CATALOG } from '../categories/catalog.js';
import { withTransaction } from '../db/pool.js';
import { domainErrors, DomainError } from './errors.js';
import type { WriteStore } from './store.js';
import type {
  CreateAccountInput, CreateCategoryInput, CreateExpenseInput, CreateIncomeInput,
  CreateTransferInput, DeleteCategoryInput, UpdateAccountInput, UpdateCategoryInput, UpdateTransactionInput,
} from './types.js';

type Row = Record<string, unknown>;

const LEGACY_CATEGORY_COLUMNS =
  'id, household_id, name, kind, active, parent_id, icon, color, sort_order, is_default, is_system';

const mapAccount = (r: Row): Account => ({
  id: r['id'] as string, householdId: r['household_id'] as string, name: r['name'] as string,
  kind: (r['kind'] as string) ? (r['kind'] as Account['kind']) : 'bank',
  balanceCents: Number(r['balance_cents'] ?? 0),
  status: r['active'] ? 'active' : 'inactive',
});
const mapCategory = (r: Row): Category => {
  const parentId = r['parent_id'] as string | null | undefined;
  const base: Category = {
    id: r['id'] as string, householdId: r['household_id'] as string, name: r['name'] as string,
    kind: r['kind'] as Category['kind'], status: r['active'] ? 'active' : 'inactive',
  };
  if (parentId) base.parentId = parentId;
  if (r['icon'] !== null && r['icon'] !== undefined) base.icon = r['icon'] as string;
  if (r['color'] !== null && r['color'] !== undefined) base.color = r['color'] as string;
  if (r['sort_order'] !== null && r['sort_order'] !== undefined) base.sortOrder = Number(r['sort_order']);
  if (r['is_default'] !== null && r['is_default'] !== undefined) base.isDefault = Boolean(r['is_default']);
  if (r['is_system'] !== null && r['is_system'] !== undefined) base.isSystem = Boolean(r['is_system']);
  return base;
};
const mapTransaction = (r: Row): Transaction => {
  const kind = r['kind'] as Transaction['kind'];
  const fromId = r['from_account_id'] as string | null; const toId = r['to_account_id'] as string | null;
  const base: Transaction = { id: r['id'] as string, householdId: r['household_id'] as string, kind, description: (r['description'] ?? '') as string, amountCents: Number(r['amount_cents']), date: (r['date'] as Date).toISOString().slice(0, 10), accountId: '' };
  if (kind === 'expense') base.accountId = fromId ?? '';
  else if (kind === 'income') base.accountId = toId ?? '';
  else { base.accountId = fromId ?? ''; if (toId) base.transferToAccountId = toId; }
  if (r['category_id']) base.categoryId = r['category_id'] as string;
  if (r['subcategory_id']) base.subcategoryId = r['subcategory_id'] as string;
  if (r['notes'] !== null && r['notes'] !== undefined) base.notes = r['notes'] as string;
  return base;
};

/**
 * Centralized subcategory validation for expense/income writes (M-03,
 * legacy schema). Same-household, active, real subcategory with matching
 * kind; when the entry names a distinct parent category, the subcategory
 * must belong to it.
 */
export const resolveSubcategoryLegacy = async (
  client: PoolClient,
  householdId: string,
  subcategoryId: string,
  txKind: 'expense' | 'income',
  parentCategoryId?: string,
): Promise<Category> => {
  const res = await client.query<Row>(
    `SELECT ${LEGACY_CATEGORY_COLUMNS} FROM categories WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
    [subcategoryId, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Subcategoria');
  const sub = mapCategory(res.rows[0]!);
  if (!sub.parentId) throw domainErrors.invalid('subcategoryId', 'deve ser uma subcategoria');
  if (sub.kind !== txKind) {
    throw domainErrors.invalid('subcategoryId', 'subcategoria deve ter o mesmo kind do lançamento');
  }
  if (parentCategoryId !== undefined && parentCategoryId !== subcategoryId && sub.parentId !== parentCategoryId) {
    throw domainErrors.invalid('subcategoryId', 'subcategoria não pertence à categoria informada');
  }
  return sub;
};

/**
 * Category check shared with the legacy CardStore (M-05): existing, active,
 * expense-kind category — the same rule as plain entries.
 */
export const resolveExpenseCategoryLegacy = async (
  client: PoolClient,
  householdId: string,
  categoryId: string,
): Promise<Category> => {
  const res = await client.query<Row>(
    `SELECT ${LEGACY_CATEGORY_COLUMNS} FROM categories WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
    [categoryId, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Categoria');
  const cat = mapCategory(res.rows[0]!);
  if (cat.kind !== 'expense') {
    throw domainErrors.invalid('categoryId', 'compra no cartão exige categoria de despesa');
  }
  return cat;
};

/** H-01: legacy accounts flag cards via is_credit_card (no kind column). */
const assertNotCreditCardLegacy = async (
  client: PoolClient,
  householdId: string,
  accountId: string,
  operation: 'compra no cartão deve usar /cards/purchases.' | 'receita não pode usar cartão de crédito.' | 'transferência não pode usar cartão de crédito.',
): Promise<void> => {
  const res = await client.query<Row>(
    `SELECT is_credit_card FROM accounts WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
    [accountId, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Conta');
  if (res.rows[0]!['is_credit_card'] === true) {
    throw new DomainError('validation.invalid', operation, 422);
  }
};

/** Idempotent catalog application inside an existing tx (legacy schema). */
const applyDefaultsLegacyInTx = async (
  client: PoolClient,
  householdId: string,
): Promise<{ created: number; skipped: number }> => {
  let created = 0;
  let skipped = 0;
  for (const [macroIdx, macro] of DEFAULT_CATEGORY_CATALOG.entries()) {
    // Race-safe: INSERT ... ON CONFLICT DO NOTHING (functional unique index
    // from V049) + SELECT, mirroring the canonical applyDefaultsInTx. Two
    // concurrent applications converge on the same rows; counts stay exact.
    const ins = await client.query<Row>(
      `INSERT INTO categories (id, household_id, name, kind, active, parent_id, icon, color, sort_order, is_default, is_system)
       VALUES (gen_random_uuid(), $1, $2, $3, true, NULL, $4, $5, $6, true, false)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [householdId, macro.name, macro.kind, macro.icon, macro.color, macroIdx],
    );
    let macroId: string;
    if ((ins.rowCount ?? 0) === 1) {
      macroId = ins.rows[0]!['id'] as string;
      created += 1;
    } else {
      const found = await findActiveCategoryByKey(client, householdId, macro.kind, null, macro.name);
      macroId = found!.id;
      skipped += 1;
    }
    for (const sub of macro.subs) {
      const subIns = await client.query(
        `INSERT INTO categories (id, household_id, name, kind, active, parent_id, icon, color, sort_order, is_default, is_system)
         VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $5, NULL, 0, true, false)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [householdId, sub.name, macro.kind, macroId, sub.icon],
      );
      if ((subIns.rowCount ?? 0) === 1) {
        created += 1;
      } else {
        skipped += 1;
      }
    }
  }
  return { created, skipped };
};

/**
 * Active category lookup by the V049 uniqueness key
 * (household/kind/parent NULL-safe/case-insensitive name). Returns the id,
 * or null when no live row matches. Shared by the upsert SELECT-after-
 * conflict paths below.
 */
const findActiveCategoryByKey = async (
  client: PoolClient,
  householdId: string,
  kind: string,
  parentId: string | null,
  name: string,
): Promise<{ id: string } | null> => {
  const found = await client.query<Row>(
    `SELECT id FROM categories
      WHERE household_id = $1 AND kind = $2
        AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
            COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND lower(name) = lower($4)
        AND active = true
      LIMIT 1`,
    [householdId, kind, parentId, name],
  );
  if ((found.rowCount ?? 0) === 0) return null;
  return { id: found.rows[0]!['id'] as string };
};

export const createLegacyPostgresWriteStore = (opts: { pool: Pool }): WriteStore => {
  const { pool } = opts;

  return {
    async createAccount(householdId: string, input: CreateAccountInput) {
      return withTransaction(pool, async (client: PoolClient) => {
        const res = await client.query<Row>(
          `INSERT INTO accounts (id, household_id, name, initial_balance_cents, active)
           VALUES (gen_random_uuid(), $1, $2, $3, true)
           RETURNING id, household_id, name, initial_balance_cents, active`,
          [householdId, input.name, input.initialBalanceCents]);
        const existing = await client.query(
          `SELECT 1 FROM categories WHERE household_id = $1 AND active = true AND deleted_at IS NULL LIMIT 1`,
          [householdId]);
        if ((existing.rowCount ?? 0) === 0) {
          await applyDefaultsLegacyInTx(client, householdId);
        }
        const r = res.rows[0]!;
        return { ...mapAccount({ ...r, balance_cents: input.initialBalanceCents }), kind: input.kind };
      });
    },
    async updateAccount(householdId: string, id: string, patch: UpdateAccountInput) {
      return withTransaction(pool, async (client: PoolClient) => {
        const res = await client.query<Row>(
          `UPDATE accounts SET name = COALESCE($3, name) WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL
           RETURNING id, household_id, name, initial_balance_cents, active`, [id, householdId, patch.name ?? null]);
        if (res.rowCount === 0) throw domainErrors.notFound('Conta');
        return mapAccount(res.rows[0]!);
      });
    },
    async deactivateAccount(householdId: string, id: string) {
      return withTransaction(pool, async (client: PoolClient) => {
        const used = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM transactions WHERE household_id = $1 AND deleted_at IS NULL AND (from_account_id = $2 OR to_account_id = $2)`, [householdId, id]);
        if (Number(used.rows[0]!.count) > 0) throw domainErrors.inUse('Conta', 'lançamentos');
        const res = await client.query<Row>(
          `UPDATE accounts SET active = false, deleted_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING id, household_id, name, initial_balance_cents, active`, [id, householdId]);
        if (res.rowCount === 0) throw domainErrors.notFound('Conta');
        return mapAccount(res.rows[0]!);
      });
    },

    async createCategory(householdId: string, input: CreateCategoryInput) {
      return withTransaction(pool, async (client: PoolClient) => {
        if (input.parentId) {
          const parentRes = await client.query<Row>(
            `SELECT id, household_id, name, kind, active, parent_id FROM categories WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
            [input.parentId, householdId],
          );
          if (parentRes.rowCount === 0) throw domainErrors.notFound('Categoria pai');
          const parent = mapCategory(parentRes.rows[0]!);
          if (parent.parentId) throw domainErrors.invalid('parentId', 'subcategoria não pode ter subcategoria');
          if (parent.kind !== input.kind) {
            throw domainErrors.invalid('parentId', 'categoria pai deve ter o mesmo kind');
          }
        }
        // Race-safe (M-02 on legacy): INSERT ... ON CONFLICT DO NOTHING on
        // the V049 functional unique index + SELECT. A concurrent duplicate
        // reuses the existing live row instead of duplicating it — same
        // return shape either way.
        const res = await client.query<Row>(
          `INSERT INTO categories (id, household_id, name, kind, active, parent_id, icon, color, sort_order, is_default, is_system)
           VALUES (gen_random_uuid(), $1, $2, $3, true, $4, $5, $6, $7, $8, false)
           ON CONFLICT DO NOTHING
           RETURNING ${LEGACY_CATEGORY_COLUMNS}`,
          [
            householdId,
            input.name,
            input.kind,
            input.parentId ?? null,
            input.icon ?? null,
            input.color ?? null,
            input.sortOrder ?? 0,
            input.isDefault ?? false,
          ]);
        if ((res.rowCount ?? 0) === 1) return mapCategory(res.rows[0]!);
        const existing = await client.query<Row>(
          `SELECT ${LEGACY_CATEGORY_COLUMNS} FROM categories
            WHERE household_id = $1 AND kind = $2
              AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
                  COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
              AND lower(name) = lower($4)
              AND active = true
            LIMIT 1`,
          [householdId, input.kind, input.parentId ?? null, input.name],
        );
        if ((existing.rowCount ?? 0) === 0) throw domainErrors.inUse('Categoria', 'nome duplicado');
        return mapCategory(existing.rows[0]!);
      });
    },
    async updateCategory(householdId: string, id: string, patch: UpdateCategoryInput) {
      return withTransaction(pool, async (client: PoolClient) => {
        const res = await client.query<Row>(
          `UPDATE categories
              SET name = COALESCE($3, name),
                  icon = COALESCE($4, icon),
                  color = COALESCE($5, color),
                  sort_order = COALESCE($6, sort_order),
                  is_default = COALESCE($7, is_default)
            WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL
           RETURNING ${LEGACY_CATEGORY_COLUMNS}`,
          [
            id,
            householdId,
            patch.name ?? null,
            patch.icon ?? null,
            patch.color ?? null,
            patch.sortOrder ?? null,
            patch.isDefault ?? null,
          ]);
        if (res.rowCount === 0) throw domainErrors.notFound('Categoria');
        return mapCategory(res.rows[0]!);
      });
    },
    async deactivateCategory(householdId: string, id: string) {
      return withTransaction(pool, async (client: PoolClient) => {
        const used = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM transactions WHERE household_id = $1 AND deleted_at IS NULL AND (category_id = $2 OR subcategory_id = $2)`, [householdId, id]);
        if (Number(used.rows[0]!.count) > 0) throw domainErrors.inUse('Categoria', 'lançamentos');
        const res = await client.query<Row>(
          `UPDATE categories SET active = false, deleted_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING ${LEGACY_CATEGORY_COLUMNS}`, [id, householdId]);
        if (res.rowCount === 0) throw domainErrors.notFound('Categoria');
        return mapCategory(res.rows[0]!);
      });
    },
    async deleteCategory(householdId: string, id: string, input: DeleteCategoryInput) {
      return withTransaction(pool, async (client: PoolClient) => {
        const catRes = await client.query<Row>(
          `SELECT ${LEGACY_CATEGORY_COLUMNS} FROM categories WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
          [id, householdId]);
        if (catRes.rowCount === 0) throw domainErrors.notFound('Categoria');
        const cat = mapCategory(catRes.rows[0]!);
        const subs = await client.query<Row>(
          `SELECT ${LEGACY_CATEGORY_COLUMNS} FROM categories WHERE household_id = $1 AND parent_id = $2 AND active = true AND deleted_at IS NULL`,
          [householdId, id]);
        const scopeIds = [id, ...subs.rows.map((r) => r['id'] as string)];
        const referencing = await client.query<Row>(
          `SELECT id FROM transactions WHERE household_id = $1 AND deleted_at IS NULL AND (category_id = ANY($2) OR subcategory_id = ANY($2))`,
          [householdId, scopeIds]);
        let movedTransactions = 0;
        let softDeletedTransactions = 0;
        if (input.mode === 'move') {
          if (!input.destinationCategoryId) {
            throw domainErrors.invalid('destinationCategoryId', 'destino é obrigatório no modo move');
          }
          const destRes = await client.query<Row>(
            `SELECT ${LEGACY_CATEGORY_COLUMNS} FROM categories WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
            [input.destinationCategoryId, householdId]);
          if (destRes.rowCount === 0) throw domainErrors.notFound('Categoria de destino');
          const dest = mapCategory(destRes.rows[0]!);
          if (dest.kind !== cat.kind) {
            throw domainErrors.invalid('destinationCategoryId', 'destino deve ter o mesmo kind');
          }
          if (scopeIds.includes(dest.id)) {
            throw domainErrors.invalid('destinationCategoryId', 'destino não pode ser a categoria excluída');
          }
          await client.query(
            `UPDATE transactions SET category_id = $3 WHERE household_id = $1 AND deleted_at IS NULL AND category_id = ANY($2)`,
            [householdId, scopeIds, dest.id]);
          await client.query(
            `UPDATE transactions SET subcategory_id = NULL WHERE household_id = $1 AND deleted_at IS NULL AND subcategory_id = ANY($2)`,
            [householdId, scopeIds]);
          movedTransactions = referencing.rowCount ?? 0;
        } else {
          if (input.confirm !== true) {
            throw domainErrors.invalid('confirm', 'exclusão em cascata exige confirm:true');
          }
          await client.query(
            `UPDATE transactions SET deleted_at = NOW() WHERE household_id = $1 AND deleted_at IS NULL AND (category_id = ANY($2) OR subcategory_id = ANY($2))`,
            [householdId, scopeIds]);
          softDeletedTransactions = referencing.rowCount ?? 0;
        }
        await client.query(
          `UPDATE categories SET active = false, deleted_at = NOW() WHERE household_id = $1 AND id = ANY($2)`,
          [householdId, scopeIds]);
        return { deletedCategoryIds: scopeIds, movedTransactions, softDeletedTransactions };
      });
    },
    async applyCategoryDefaults(householdId: string) {
      return withTransaction(pool, async (client: PoolClient) => applyDefaultsLegacyInTx(client, householdId));
    },

    async createExpense(householdId: string, input: CreateExpenseInput) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      return withTransaction(pool, async (client: PoolClient) => {
        await assertNotCreditCardLegacy(client, householdId, input.accountId, 'compra no cartão deve usar /cards/purchases.');
        if (input.subcategoryId !== undefined) {
          await resolveSubcategoryLegacy(client, householdId, input.subcategoryId, 'expense', input.categoryId);
        }
        const res = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, category_id, subcategory_id, notes)
           VALUES (gen_random_uuid(), $1, 'expense', $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, household_id, kind, description, amount_cents, date, from_account_id, category_id, subcategory_id, notes`,
          [householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId, input.subcategoryId ?? null, input.notes ?? null]);
        return mapTransaction(res.rows[0]!);
      });
    },
    async createIncome(householdId: string, input: CreateIncomeInput) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      return withTransaction(pool, async (client: PoolClient) => {
        await assertNotCreditCardLegacy(client, householdId, input.accountId, 'receita não pode usar cartão de crédito.');
        if (input.subcategoryId !== undefined) {
          await resolveSubcategoryLegacy(client, householdId, input.subcategoryId, 'income', input.categoryId);
        }
        const res = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, to_account_id, category_id, subcategory_id, notes)
           VALUES (gen_random_uuid(), $1, 'income', $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, household_id, kind, description, amount_cents, date, to_account_id, category_id, subcategory_id, notes`,
          [householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId, input.subcategoryId ?? null, input.notes ?? null]);
        return mapTransaction(res.rows[0]!);
      });
    },
    async createTransfer(householdId: string, input: CreateTransferInput) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      if (input.fromAccountId === input.toAccountId) throw domainErrors.invalid('toAccountId', 'deve ser diferente');
      return withTransaction(pool, async (client: PoolClient) => {
        await assertNotCreditCardLegacy(client, householdId, input.fromAccountId, 'transferência não pode usar cartão de crédito.');
        await assertNotCreditCardLegacy(client, householdId, input.toAccountId, 'transferência não pode usar cartão de crédito.');
        const res = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, to_account_id)
           VALUES (gen_random_uuid(), $1, 'transfer', $2, $3, $4, $5, $6)
           RETURNING id, household_id, kind, description, amount_cents, date, from_account_id, to_account_id`,
          [householdId, input.description, input.amountCents, input.date, input.fromAccountId, input.toAccountId]);
        return mapTransaction(res.rows[0]!);
      });
    },
    async updateTransaction(householdId: string, id: string, patch: UpdateTransactionInput) {
      return withTransaction(pool, async (client: PoolClient) => {
        const existing = await client.query<Row>(
          `SELECT kind, category_id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`, [id, householdId]);
        if (existing.rowCount === 0) throw domainErrors.notFound('Lançamento');
        if (patch.description === undefined && patch.date === undefined && patch.amountCents === undefined && patch.subcategoryId === undefined && patch.notes === undefined) return mapTransaction(existing.rows[0]!);
        if (patch.subcategoryId !== undefined) {
          const txKind = existing.rows[0]!['kind'] as 'expense' | 'income' | 'transfer';
          if (txKind === 'transfer') {
            throw domainErrors.unsupported('transferências só podem ter descrição e data alteradas');
          }
          const parentId = patch.categoryId ?? (existing.rows[0]!['category_id'] as string | undefined);
          await resolveSubcategoryLegacy(client, householdId, patch.subcategoryId, txKind, parentId);
        }
        const res = await client.query<Row>(
          `UPDATE transactions SET description = COALESCE($3, description), date = COALESCE($4, date), amount_cents = COALESCE($5, amount_cents), subcategory_id = COALESCE($6, subcategory_id), notes = COALESCE($7, notes)
           WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL
           RETURNING id, household_id, kind, description, amount_cents, date, from_account_id, to_account_id, category_id, subcategory_id, notes`,
          [id, householdId, patch.description ?? null, patch.date ?? null, patch.amountCents ?? null, patch.subcategoryId ?? null, patch.notes ?? null]);
        if (res.rowCount === 0) throw domainErrors.notFound('Lançamento');
        return mapTransaction(res.rows[0]!);
      });
    },
    async softDeleteTransaction(householdId: string, id: string) {
      return withTransaction(pool, async (client: PoolClient) => {
        const res = await client.query<Row>(
          `UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL
           RETURNING id, household_id, kind, description, amount_cents, date, from_account_id, to_account_id, category_id`,
          [id, householdId]);
        if (res.rowCount === 0) throw domainErrors.notFound('Lançamento');
        return mapTransaction(res.rows[0]!);
      });
    },
  };
};
