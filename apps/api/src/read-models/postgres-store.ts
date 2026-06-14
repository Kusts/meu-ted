/**
 * Postgres implementation of ReadModelStore.
 *
 * Schema lives in `sql/V001__init.sql`. Connection is provided by the
 * caller (we accept a Pool to keep this module easy to test). The store
 * builds parameterized SQL for every filter and always scopes by the
 * householdId the caller passes — server-side derivation lives in the
 * route layer, so this layer never trusts client-supplied ids.
 */

import type { Pool, PoolClient } from 'pg';
import type { Account, Category, Transaction, TransactionFilters } from '../types/domain.js';
import type { ReadModelStore } from './store.js';
import { transactionFiltersSchema, type ParsedTransactionFilters } from '../types/transactions.js';

type Row = Record<string, unknown>;

const mapAccount = (r: Row): Account => ({
  id: r['id'] as string,
  householdId: r['household_id'] as string,
  name: r['name'] as string,
  kind: r['kind'] as Account['kind'],
  balanceCents: Number(r['balance_cents']),
  status: r['status'] as Account['status'],
});

const mapCategory = (r: Row): Category => ({
  id: r['id'] as string,
  householdId: r['household_id'] as string,
  name: r['name'] as string,
  kind: r['kind'] as Category['kind'],
  status: r['status'] as Category['status'],
});

const mapTransaction = (r: Row): Transaction => {
  const base: Transaction = {
    id: r['id'] as string,
    householdId: r['household_id'] as string,
    kind: r['kind'] as Transaction['kind'],
    description: r['description'] as string,
    amountCents: Number(r['amount_cents']),
    date: (r['date'] as Date).toISOString().slice(0, 10),
    accountId: r['account_id'] as string,
  };
  const cat = r['category_id'];
  const to = r['transfer_to_account_id'];
  if (cat !== null && cat !== undefined) {
    return { ...base, categoryId: cat as string };
  }
  if (to !== null && to !== undefined) {
    return { ...base, transferToAccountId: to as string };
  }
  return base;
};

export const createPostgresReadModelStore = (opts: { pool: Pool }): ReadModelStore => {
  const { pool } = opts;

  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  return {
    async listAccounts(householdId) {
      const rows = await query<Row>(
        `SELECT id, household_id, name, kind, balance_cents, status
           FROM accounts
          WHERE household_id = $1
            AND status = 'active'
            AND kind <> 'credit_card'
            AND deleted_at IS NULL`,
        [householdId],
      );
      return rows.map(mapAccount);
    },

    async listCategories(householdId) {
      const rows = await query<Row>(
        `SELECT id, household_id, name, kind, status
           FROM categories
          WHERE household_id = $1
            AND status = 'active'
            AND deleted_at IS NULL`,
        [householdId],
      );
      return rows.map(mapCategory);
    },

    async listTransactions(householdId, filters) {
      const parsed: ParsedTransactionFilters = transactionFiltersSchema.parse(filters);

      // Build a clean object with only defined keys (exactOptionalPropertyTypes).
      const clean: TransactionFilters = {};
      if (parsed.startDate !== undefined) clean.startDate = parsed.startDate;
      if (parsed.endDate !== undefined) clean.endDate = parsed.endDate;
      if (parsed.accountId !== undefined) clean.accountId = parsed.accountId;
      if (parsed.categoryId !== undefined) clean.categoryId = parsed.categoryId;
      if (parsed.kind !== undefined) clean.kind = parsed.kind;
      if (parsed.minAmountCents !== undefined) clean.minAmountCents = parsed.minAmountCents;
      if (parsed.maxAmountCents !== undefined) clean.maxAmountCents = parsed.maxAmountCents;
      if (parsed.query !== undefined) clean.query = parsed.query;

      const where: string[] = ['household_id = $1', "deleted_at IS NULL"];
      const values: unknown[] = [householdId];

      if (clean.startDate !== undefined) {
        values.push(clean.startDate);
        where.push(`date >= $${values.length}`);
      }
      if (clean.endDate !== undefined) {
        values.push(clean.endDate);
        where.push(`date <= $${values.length}`);
      }
      if (clean.accountId !== undefined) {
        values.push(clean.accountId);
        where.push(`account_id = $${values.length}`);
      }
      if (clean.categoryId !== undefined) {
        values.push(clean.categoryId);
        where.push(`category_id = $${values.length}`);
      }
      if (clean.kind !== undefined) {
        values.push(clean.kind);
        where.push(`kind = $${values.length}`);
      }
      if (clean.minAmountCents !== undefined) {
        values.push(clean.minAmountCents);
        where.push(`amount_cents >= $${values.length}`);
      }
      if (clean.maxAmountCents !== undefined) {
        values.push(clean.maxAmountCents);
        where.push(`amount_cents <= $${values.length}`);
      }
      if (clean.query !== undefined) {
        values.push(`%${clean.query.toLowerCase()}%`);
        where.push(`LOWER(description) LIKE $${values.length}`);
      }

      const whereSql = where.join(' AND ');

      // Count total
      const totalRes = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM transactions WHERE ${whereSql}`,
        values,
      );
      const total = Number(totalRes.rows[0]?.count ?? 0);

      // Page
      values.push(parsed.limit);
      const limitIdx = values.length;
      values.push(parsed.offset);
      const offsetIdx = values.length;

      const rows = await query<Row>(
        `SELECT id, household_id, kind, description, amount_cents, date,
                account_id, category_id, transfer_to_account_id
           FROM transactions
          WHERE ${whereSql}
          ORDER BY date DESC, id DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        values,
      );

      return {
        items: rows.map(mapTransaction),
        total,
      };
    },

    async listAllTransactions(householdId) {
      const rows = await query<Row>(
        `SELECT id, household_id, kind, description, amount_cents, date,
                account_id, category_id, transfer_to_account_id
           FROM transactions
          WHERE household_id = $1
            AND deleted_at IS NULL`,
        [householdId],
      );
      return rows.map(mapTransaction);
    },
  };
};

/**
 * Helper: insert a seed row. Used by tests; not exported via the public
 * `ReadModelStore` interface because CRUD lives in a later slice.
 */
export const insertSeed = async (
  client: PoolClient,
  table: 'accounts' | 'categories' | 'transactions' | 'device_tokens',
  values: Record<string, unknown>,
): Promise<void> => {
  const cols = Object.keys(values);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const params = cols.map((c) => values[c]);
  await client.query(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`,
    params,
  );
};
