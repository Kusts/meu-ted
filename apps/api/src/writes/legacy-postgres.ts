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
import { withTransaction } from '../db/pool.js';
import { domainErrors } from './errors.js';
import type { WriteStore } from './store.js';
import type {
  CreateAccountInput, CreateCategoryInput, CreateExpenseInput, CreateIncomeInput,
  CreateTransferInput, UpdateAccountInput, UpdateCategoryInput, UpdateTransactionInput,
} from './types.js';

type Row = Record<string, unknown>;

const mapAccount = (r: Row): Account => ({
  id: r['id'] as string, householdId: r['household_id'] as string, name: r['name'] as string,
  kind: (r['kind'] as string) ? (r['kind'] as Account['kind']) : 'bank',
  balanceCents: Number(r['balance_cents'] ?? 0),
  status: r['active'] ? 'active' : 'inactive',
});
const mapCategory = (r: Row): Category => ({
  id: r['id'] as string, householdId: r['household_id'] as string, name: r['name'] as string,
  kind: r['kind'] as Category['kind'], status: r['active'] ? 'active' : 'inactive',
});
const mapTransaction = (r: Row): Transaction => {
  const kind = r['kind'] as Transaction['kind'];
  const fromId = r['from_account_id'] as string | null; const toId = r['to_account_id'] as string | null;
  const base: Transaction = { id: r['id'] as string, householdId: r['household_id'] as string, kind, description: (r['description'] ?? '') as string, amountCents: Number(r['amount_cents']), date: (r['date'] as Date).toISOString().slice(0, 10), accountId: '' };
  if (kind === 'expense') base.accountId = fromId ?? '';
  else if (kind === 'income') base.accountId = toId ?? '';
  else { base.accountId = fromId ?? ''; if (toId) base.transferToAccountId = toId; }
  if (r['category_id']) base.categoryId = r['category_id'] as string;
  return base;
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
        const res = await client.query<Row>(
          `INSERT INTO categories (id, household_id, name, kind, active) VALUES (gen_random_uuid(), $1, $2, $3, true) RETURNING id, household_id, name, kind, active`,
          [householdId, input.name, input.kind]);
        return mapCategory(res.rows[0]!);
      });
    },
    async updateCategory(householdId: string, id: string, patch: UpdateCategoryInput) {
      return withTransaction(pool, async (client: PoolClient) => {
        const res = await client.query<Row>(
          `UPDATE categories SET name = COALESCE($3, name) WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL RETURNING id, household_id, name, kind, active`,
          [id, householdId, patch.name ?? null]);
        if (res.rowCount === 0) throw domainErrors.notFound('Categoria');
        return mapCategory(res.rows[0]!);
      });
    },
    async deactivateCategory(householdId: string, id: string) {
      return withTransaction(pool, async (client: PoolClient) => {
        const used = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM transactions WHERE household_id = $1 AND deleted_at IS NULL AND category_id = $2`, [householdId, id]);
        if (Number(used.rows[0]!.count) > 0) throw domainErrors.inUse('Categoria', 'lançamentos');
        const res = await client.query<Row>(
          `UPDATE categories SET active = false, deleted_at = NOW() WHERE id = $1 AND household_id = $2 RETURNING id, household_id, name, kind, active`, [id, householdId]);
        if (res.rowCount === 0) throw domainErrors.notFound('Categoria');
        return mapCategory(res.rows[0]!);
      });
    },

    async createExpense(householdId: string, input: CreateExpenseInput) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      return withTransaction(pool, async (client: PoolClient) => {
        const res = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, category_id)
           VALUES (gen_random_uuid(), $1, 'expense', $2, $3, $4, $5, $6)
           RETURNING id, household_id, kind, description, amount_cents, date, from_account_id, category_id`,
          [householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId]);
        return mapTransaction(res.rows[0]!);
      });
    },
    async createIncome(householdId: string, input: CreateIncomeInput) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      return withTransaction(pool, async (client: PoolClient) => {
        const res = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, to_account_id, category_id)
           VALUES (gen_random_uuid(), $1, 'income', $2, $3, $4, $5, $6)
           RETURNING id, household_id, kind, description, amount_cents, date, to_account_id, category_id`,
          [householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId]);
        return mapTransaction(res.rows[0]!);
      });
    },
    async createTransfer(householdId: string, input: CreateTransferInput) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      if (input.fromAccountId === input.toAccountId) throw domainErrors.invalid('toAccountId', 'deve ser diferente');
      return withTransaction(pool, async (client: PoolClient) => {
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
          `SELECT kind FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`, [id, householdId]);
        if (existing.rowCount === 0) throw domainErrors.notFound('Lançamento');
        if (patch.description === undefined && patch.date === undefined && patch.amountCents === undefined) return mapTransaction(existing.rows[0]!);
        const res = await client.query<Row>(
          `UPDATE transactions SET description = COALESCE($3, description), date = COALESCE($4, date), amount_cents = COALESCE($5, amount_cents)
           WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL
           RETURNING id, household_id, kind, description, amount_cents, date, from_account_id, to_account_id, category_id`,
          [id, householdId, patch.description ?? null, patch.date ?? null, patch.amountCents ?? null]);
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
