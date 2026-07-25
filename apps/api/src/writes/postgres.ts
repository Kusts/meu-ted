/**
 * Postgres implementation of WriteStore.
 *
 * Every method is wrapped in a transaction. Reads for invariants
 * (account exists in household, account has no active transactions,
 * etc.) run inside the same tx so concurrency is safe.
 *
 * Soft-delete: sets transactions.deleted_at = NOW() inside the tx.
 * The read store already filters by `deleted_at IS NULL`.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Account, Category, Transaction } from '../types/domain.js';
import { withTransaction } from '../db/pool.js';
import { domainErrors, DomainError } from './errors.js';
import type { WriteStore } from './store.js';
import type {
  CreateAccountInput,
  CreateCategoryInput,
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
  UpdateAccountInput,
  UpdateCategoryInput,
  UpdateTransactionInput,
} from './types.js';

type Row = Record<string, unknown>;

const mapAccount = (r: Row): Account => ({
  id: r['id'] as string,
  householdId: r['household_id'] as string,
  name: r['name'] as string,
  kind: r['kind'] as Account['kind'],
  balanceCents: Number(r['balance_cents']),
  status: r['status'] as Account['status'],
});

const mapCategory = (r: Row): Category => {
  const parentId = r['parent_id'] as string | null | undefined;
  const base: Category = {
    id: r['id'] as string,
    householdId: r['household_id'] as string,
    name: r['name'] as string,
    kind: r['kind'] as Category['kind'],
    status: r['status'] as Category['status'],
  };
  if (parentId) base.parentId = parentId;
  return base;
};

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
  if (cat !== null && cat !== undefined) return { ...base, categoryId: cat as string };
  if (to !== null && to !== undefined) return { ...base, transferToAccountId: to as string };
  return base;
};

const findAccountInHousehold = async (
  client: import('pg').PoolClient,
  id: string,
  householdId: string,
): Promise<Account> => {
  const res = await client.query<Row>(
    `SELECT id, household_id, name, kind, balance_cents, status
       FROM accounts
      WHERE id = $1 AND household_id = $2`,
    [id, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Conta');
  return mapAccount(res.rows[0]!);
};

const findCategoryInHousehold = async (
  client: import('pg').PoolClient,
  id: string,
  householdId: string,
): Promise<Category> => {
  const res = await client.query<Row>(
    `SELECT id, household_id, name, kind, status
       FROM categories
      WHERE id = $1 AND household_id = $2`,
    [id, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Categoria');
  return mapCategory(res.rows[0]!);
};

const findActiveTransaction = async (
  client: import('pg').PoolClient,
  id: string,
  householdId: string,
): Promise<Transaction> => {
  const res = await client.query<Row>(
    `SELECT id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id
       FROM transactions
      WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
    [id, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Lançamento');
  return mapTransaction(res.rows[0]!);
};

export const createPostgresWriteStore = (opts: { pool: Pool }): WriteStore => {
  const { pool } = opts;

  return {
    async createAccount(householdId, input) {
      return withTransaction(pool, async (client) => {
        const res = await client.query<Row>(
          `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active')
           RETURNING id, household_id, name, kind, balance_cents, status`,
          [householdId, input.name, input.kind, input.initialBalanceCents],
        );
        return mapAccount(res.rows[0]!);
      });
    },

    async updateAccount(householdId, id, patch) {
      return withTransaction(pool, async (client) => {
        const existing = await findAccountInHousehold(client, id, householdId);
        if (existing.status !== 'active') throw domainErrors.notFound('Conta');
        const res = await client.query<Row>(
          `UPDATE accounts
              SET name = COALESCE($3, name)
            WHERE id = $1 AND household_id = $2
            RETURNING id, household_id, name, kind, balance_cents, status`,
          [id, householdId, patch.name ?? null],
        );
        return mapAccount(res.rows[0]!);
      });
    },

    async deactivateAccount(householdId, id) {
      return withTransaction(pool, async (client) => {
        const existing = await findAccountInHousehold(client, id, householdId);
        if (existing.status !== 'active') throw domainErrors.notFound('Conta');
        const used = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM transactions
            WHERE household_id = $1
              AND deleted_at IS NULL
              AND (account_id = $2 OR transfer_to_account_id = $2)`,
          [householdId, id],
        );
        if (Number(used.rows[0]!.count) > 0) {
          throw domainErrors.inUse('Conta', 'lançamentos');
        }
        const res = await client.query<Row>(
          `UPDATE accounts
              SET status = 'inactive'
            WHERE id = $1 AND household_id = $2
            RETURNING id, household_id, name, kind, balance_cents, status`,
          [id, householdId],
        );
        return mapAccount(res.rows[0]!);
      });
    },

    async createCategory(householdId, input) {
      return withTransaction(pool, async (client) => {
        if (input.parentId) {
          const parent = await findCategoryInHousehold(client, input.parentId, householdId);
          if (parent.status !== 'active') throw domainErrors.notFound('Categoria pai');
          if (parent.parentId) throw domainErrors.invalid('parentId', 'subcategoria não pode ter subcategoria');
          if (parent.kind !== input.kind) {
            throw domainErrors.invalid('parentId', 'categoria pai deve ter o mesmo kind');
          }
        }
        const res = await client.query<Row>(
          `INSERT INTO categories (id, household_id, name, kind, status, parent_id)
           VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4)
           RETURNING id, household_id, name, kind, status, parent_id`,
          [householdId, input.name, input.kind, input.parentId ?? null],
        );
        return mapCategory(res.rows[0]!);
      });
    },

    async updateCategory(householdId, id, patch) {
      return withTransaction(pool, async (client) => {
        const existing = await findCategoryInHousehold(client, id, householdId);
        if (existing.status !== 'active') throw domainErrors.notFound('Categoria');
        const res = await client.query<Row>(
          `UPDATE categories
              SET name = COALESCE($3, name)
            WHERE id = $1 AND household_id = $2
            RETURNING id, household_id, name, kind, status`,
          [id, householdId, patch.name ?? null],
        );
        return mapCategory(res.rows[0]!);
      });
    },

    async deactivateCategory(householdId, id) {
      return withTransaction(pool, async (client) => {
        const existing = await findCategoryInHousehold(client, id, householdId);
        if (existing.status !== 'active') throw domainErrors.notFound('Categoria');
        const used = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
             FROM transactions
            WHERE household_id = $1
              AND deleted_at IS NULL
              AND category_id = $2`,
          [householdId, id],
        );
        if (Number(used.rows[0]!.count) > 0) {
          throw domainErrors.inUse('Categoria', 'lançamentos');
        }
        const res = await client.query<Row>(
          `UPDATE categories
              SET status = 'inactive'
            WHERE id = $1 AND household_id = $2
            RETURNING id, household_id, name, kind, status`,
          [id, householdId],
        );
        return mapCategory(res.rows[0]!);
      });
    },

    async createExpense(householdId, input) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      return withTransaction(pool, async (client) => {
        const acc = await findAccountInHousehold(client, input.accountId, householdId);
        if (acc.status !== 'active') throw domainErrors.notFound('Conta');
        const cat = await findCategoryInHousehold(client, input.categoryId, householdId);
        if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
        const txRes = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id)
           VALUES (gen_random_uuid(), $1, 'expense', $2, $3, $4, $5, $6)
           RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
          [householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId],
        );
        await client.query(
          `UPDATE accounts
              SET balance_cents = GREATEST(0, balance_cents - $2)
            WHERE id = $1`,
          [input.accountId, input.amountCents],
        );
        return mapTransaction(txRes.rows[0]!);
      });
    },

    async createIncome(householdId, input) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      return withTransaction(pool, async (client) => {
        const acc = await findAccountInHousehold(client, input.accountId, householdId);
        if (acc.status !== 'active') throw domainErrors.notFound('Conta');
        const cat = await findCategoryInHousehold(client, input.categoryId, householdId);
        if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
        const txRes = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id)
           VALUES (gen_random_uuid(), $1, 'income', $2, $3, $4, $5, $6)
           RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
          [householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId],
        );
        await client.query(
          `UPDATE accounts SET balance_cents = balance_cents + $2 WHERE id = $1`,
          [input.accountId, input.amountCents],
        );
        return mapTransaction(txRes.rows[0]!);
      });
    },

    async createTransfer(householdId, input) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      if (input.fromAccountId === input.toAccountId) {
        throw domainErrors.invalid('toAccountId', 'deve ser diferente da conta de origem');
      }
      return withTransaction(pool, async (client) => {
        const from = await findAccountInHousehold(client, input.fromAccountId, householdId);
        if (from.status !== 'active') throw domainErrors.notFound('Conta');
        const to = await findAccountInHousehold(client, input.toAccountId, householdId);
        if (to.status !== 'active') throw domainErrors.notFound('Conta');
        const txRes = await client.query<Row>(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, transfer_to_account_id)
           VALUES (gen_random_uuid(), $1, 'transfer', $2, $3, $4, $5, $6)
           RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
          [householdId, input.description, input.amountCents, input.date, input.fromAccountId, input.toAccountId],
        );
        await client.query(
          `UPDATE accounts
              SET balance_cents = GREATEST(0, balance_cents - $2)
            WHERE id = $1`,
          [input.fromAccountId, input.amountCents],
        );
        await client.query(
          `UPDATE accounts SET balance_cents = balance_cents + $2 WHERE id = $1`,
          [input.toAccountId, input.amountCents],
        );
        return mapTransaction(txRes.rows[0]!);
      });
    },

    async updateTransaction(householdId, id, patch) {
      return withTransaction(pool, async (client) => {
        const tx = await findActiveTransaction(client, id, householdId);
        if (tx.kind === 'transfer') {
          if (
            patch.amountCents !== undefined ||
            patch.accountId !== undefined ||
            patch.categoryId !== undefined
          ) {
            throw domainErrors.unsupported(
              'transferências só podem ter descrição e data alteradas',
            );
          }
          if (patch.description === undefined && patch.date === undefined) return tx;
          const res = await client.query<Row>(
            `UPDATE transactions
                SET description = COALESCE($3, description),
                    date        = COALESCE($4, date)
              WHERE id = $1 AND household_id = $2
              RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
            [id, householdId, patch.description ?? null, patch.date ?? null],
          );
          return mapTransaction(res.rows[0]!);
        }
        // expense / income
        if (patch.description === undefined && patch.date === undefined && patch.amountCents === undefined && patch.accountId === undefined && patch.categoryId === undefined) {
          return tx;
        }
        if (patch.amountCents !== undefined && patch.amountCents <= 0) {
          throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
        }
        if (patch.accountId !== undefined) {
          const next = await findAccountInHousehold(client, patch.accountId, householdId);
          if (next.status !== 'active') throw domainErrors.notFound('Conta');
        }
        if (patch.categoryId !== undefined) {
          const next = await findCategoryInHousehold(client, patch.categoryId, householdId);
          if (next.status !== 'active') throw domainErrors.notFound('Categoria');
        }
        // Apply amount: restore old, then apply new.
        if (patch.amountCents !== undefined) {
          const sign = tx.kind === 'expense' ? '+' : '-';
          await client.query(
            `UPDATE accounts SET balance_cents = balance_cents ${sign} $2 WHERE id = $1`,
            [tx.accountId, tx.amountCents],
          );
          const newSign = tx.kind === 'expense' ? '-' : '+';
          await client.query(
            `UPDATE accounts SET balance_cents = GREATEST(0, balance_cents ${newSign} $2) WHERE id = $1`,
            [tx.accountId, patch.amountCents],
          );
        }
        if (patch.accountId !== undefined && patch.accountId !== tx.accountId) {
          // Revert on old, apply on new.
          const sign = tx.kind === 'expense' ? '+' : '-';
          await client.query(
            `UPDATE accounts SET balance_cents = balance_cents ${sign} $2 WHERE id = $1`,
            [tx.accountId, tx.amountCents],
          );
          const newSign = tx.kind === 'expense' ? '-' : '+';
          await client.query(
            `UPDATE accounts SET balance_cents = GREATEST(0, balance_cents ${newSign} $2) WHERE id = $1`,
            [patch.accountId, tx.amountCents],
          );
        }
        const res = await client.query<Row>(
          `UPDATE transactions
              SET description = COALESCE($3, description),
                  date        = COALESCE($4, date),
                  amount_cents = COALESCE($5, amount_cents),
                  account_id  = COALESCE($6, account_id),
                  category_id = COALESCE($7, category_id)
            WHERE id = $1 AND household_id = $2
            RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
          [
            id, householdId,
            patch.description ?? null,
            patch.date ?? null,
            patch.amountCents ?? null,
            patch.accountId ?? null,
            patch.categoryId ?? null,
          ],
        );
        return mapTransaction(res.rows[0]!);
      });
    },

    async softDeleteTransaction(householdId, id) {
      return withTransaction(pool, async (client) => {
        const tx = await findActiveTransaction(client, id, householdId);
        // Restore balance effect.
        if (tx.kind === 'expense') {
          await client.query(
            `UPDATE accounts SET balance_cents = balance_cents + $2 WHERE id = $1`,
            [tx.accountId, tx.amountCents],
          );
        } else if (tx.kind === 'income') {
          await client.query(
            `UPDATE accounts SET balance_cents = GREATEST(0, balance_cents - $2) WHERE id = $1`,
            [tx.accountId, tx.amountCents],
          );
        } else if (tx.kind === 'transfer') {
          await client.query(
            `UPDATE accounts SET balance_cents = balance_cents + $2 WHERE id = $1`,
            [tx.accountId, tx.amountCents],
          );
          if (tx.transferToAccountId) {
            await client.query(
              `UPDATE accounts SET balance_cents = GREATEST(0, balance_cents - $2) WHERE id = $1`,
              [tx.transferToAccountId, tx.amountCents],
            );
          }
        }
        const res = await client.query<Row>(
          `UPDATE transactions
              SET deleted_at = NOW()
            WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL
            RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
          [id, householdId],
        );
        if (res.rowCount === 0) throw domainErrors.notFound('Lançamento');
        return mapTransaction(res.rows[0]!);
      });
    },
  };
};

/**
 * Postgres idempotency store. TTL 24h, lazy eviction on lookup.
 */
export const createPostgresIdempotencyStore = (opts: { pool: Pool }): import('./idempotency.js').IdempotencyStore => {
  const { pool } = opts;
  const hash = (payload: unknown): string => {
    const json = JSON.stringify(payload, Object.keys(payload as object).sort());
    let h = 0;
    for (let i = 0; i < json.length; i++) h = (h * 31 + json.charCodeAt(i)) | 0;
    return String(h);
  };
  return {
    async lookupOrRecord(householdId, key, payload, producer) {
      const payloadHash = hash(payload);
      return withTransaction(pool, async (client) => {
        const existing = await client.query<{ payload_hash: string; response: unknown; created_at: Date }>(
          `SELECT payload_hash, response, created_at
             FROM idempotency_keys
            WHERE household_id = $1 AND key = $2`,
          [householdId, key],
        );
        const now = Date.now();
        if (existing.rowCount && existing.rowCount > 0) {
          const row = existing.rows[0]!;
          const ageMs = now - new Date(row.created_at).getTime();
          if (ageMs > 24 * 60 * 60 * 1000) {
            await client.query(`DELETE FROM idempotency_keys WHERE household_id = $1 AND key = $2`, [householdId, key]);
          } else {
            if (row.payload_hash !== payloadHash) throw domainErrors.idempotencyConflict();
            return { response: row.response as never, replayed: true };
          }
        }
        const response = await producer();
        await client.query(
          `INSERT INTO idempotency_keys (household_id, key, payload_hash, response)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (household_id, key) DO UPDATE SET payload_hash = EXCLUDED.payload_hash, response = EXCLUDED.response, created_at = NOW()`,
          [householdId, key, payloadHash, JSON.stringify(response)],
        );
        return { response, replayed: false };
      });
    },
    clear: () => {
      throw new Error('clear() is not supported on the Postgres idempotency store; use TRUNCATE if needed');
    },
  };
};
