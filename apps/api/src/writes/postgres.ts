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
import type { Pool, PoolClient } from 'pg';
import type { Account, Category, Transaction } from '../types/domain.js';
import { DEFAULT_CATEGORY_CATALOG } from '../categories/catalog.js';
import { assertCategoryKind, CARD_EXPENSE_KIND_MESSAGE } from '../categories/resolve.js';
import { withTransaction } from '../db/pool.js';
import { domainErrors, DomainError } from './errors.js';
import { buildIdempotencyKey, hashPayloadV2, matchesPayloadHash, type IdempotencyProducer } from './idempotency.js';
import { runKeyedMutation } from './pending-idempotency.js';
import type { WriteStore } from './store.js';
import { resolveApplicationUserId } from '../auth/resolve-user-id.js';
import { resolveHouseholdId } from '../auth/resolve-household-id.js';
import type {
  CreateAccountInput,
  CreateExpenseInput,
  CreateIncomeInput,
  CreateTransferInput,
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
  if (r['icon'] !== null && r['icon'] !== undefined) base.icon = r['icon'] as string;
  if (r['color'] !== null && r['color'] !== undefined) base.color = r['color'] as string;
  if (r['sort_order'] !== null && r['sort_order'] !== undefined) base.sortOrder = Number(r['sort_order']);
  if (r['is_default'] !== null && r['is_default'] !== undefined) base.isDefault = Boolean(r['is_default']);
  if (r['is_system'] !== null && r['is_system'] !== undefined) base.isSystem = Boolean(r['is_system']);
  return base;
};

const CATEGORY_COLUMNS = 'id, household_id, name, kind, status, parent_id, icon, color, sort_order, is_default, is_system';

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
  const sub = r['subcategory_id'];
  const to = r['transfer_to_account_id'];
  if (cat !== null && cat !== undefined) base.categoryId = cat as string;
  if (sub !== null && sub !== undefined) base.subcategoryId = sub as string;
  if (to !== null && to !== undefined) base.transferToAccountId = to as string;
  const notes = r['notes'];
  if (notes !== null && notes !== undefined) base.notes = notes as string;
  return base;
};

const TRANSACTION_COLUMNS =
  'id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id, transfer_to_account_id, notes';

/**
 * V4.1 REVIEWFIX F3 [major]: a transaction linked as the payment effect of
 * a paid payable (accounts_payable.paid_transaction_id) must not be
 * edited or deleted directly — pay 100 from A → PATCH to 1 on B → unpay
 * would credit 1 to B while A stays debited 100. Both updateTransaction
 * and softDeleteTransactionInTx reject with 409; the undo path
 * (undoPayablePayment) clears paid_transaction_id BEFORE tombstoning, so
 * it is unaffected. Uses the same `conflict` shape as statement guards.
 */
const assertNotLinkedToPaidPayable = async (
  client: PoolClient,
  householdId: string,
  transactionId: string,
): Promise<void> => {
  const linked = await client.query(
    `SELECT 1 FROM accounts_payable
      WHERE household_id = $1 AND paid_transaction_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [householdId, transactionId],
  );
  if ((linked.rowCount ?? 0) > 0) {
    throw domainErrors.conflict(
      'Lançamento vinculado a conta paga não pode ser alterado; desfaça o pagamento primeiro.',
    );
  }
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

/**
 * V4.1 Phase 4 (Tasks 4.6–4.7, D1 option B): row-lock core for every
 * materialized-balance mutation. The SELECT … FOR UPDATE serializes
 * concurrent debits on the same account inside the caller's transaction,
 * and the returned balance is the decision point for the
 * insufficient-funds validation — no silent GREATEST(0, …) clamp.
 */
type LockedAccount = { id: string; kind: string; status: string; balanceCents: number };

const lockAccountRow = async (
  client: import('pg').PoolClient,
  id: string,
  householdId: string,
): Promise<LockedAccount> => {
  const res = await client.query<Row>(
    `SELECT id, kind, balance_cents, status FROM accounts
      WHERE id = $1 AND household_id = $2
      FOR UPDATE`,
    [id, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Conta');
  const row = res.rows[0]!;
  return {
    id: row['id'] as string,
    kind: row['kind'] as string,
    status: row['status'] as string,
    balanceCents: Number(row['balance_cents']),
  };
};

/**
 * V4.1 Phase 4 Task 4.7: deterministic lock ordering. Two-account
 * mutations (transfer, transaction move) lock in sorted id order so two
 * opposite-direction transfers can never deadlock each other.
 */
const lockAccountsOrdered = async (
  client: import('pg').PoolClient,
  householdId: string,
  ids: string[],
): Promise<Map<string, LockedAccount>> => {
  const ordered = [...new Set(ids)].sort();
  const locked = new Map<string, LockedAccount>();
  for (const id of ordered) {
    locked.set(id, await lockAccountRow(client, id, householdId));
  }
  return locked;
};

/**
 * V4.1 Phase 4 (D1 option B): insufficient-funds rejection. Same 400
 * `validation.invalid` shape the payables and card stores use.
 */
const assertSufficientFunds = (balanceCents: number, amountCents: number): void => {
  if (balanceCents < amountCents) {
    throw domainErrors.invalid('amountCents', 'saldo insuficiente na conta de origem');
  }
};

const findCategoryInHousehold = async (
  client: import('pg').PoolClient,
  id: string,
  householdId: string,
): Promise<Category> => {
  const res = await client.query<Row>(
    `SELECT ${CATEGORY_COLUMNS}
       FROM categories
      WHERE id = $1 AND household_id = $2`,
    [id, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Categoria');
  return mapCategory(res.rows[0]!);
};

/**
 * Guards the V048 uniqueness scope (household/kind/parent/name) so a
 * duplicate insert/rename surfaces as 409 in_use instead of a 500 from the
 * unique index. `excludeId` skips the row being renamed.
 */
const assertCategoryNameFree = async (
  client: import('pg').PoolClient,
  householdId: string,
  input: { name: string; kind: 'expense' | 'income'; parentId?: string },
  excludeId?: string,
): Promise<void> => {
  const res = await client.query<Row>(
    `SELECT id FROM categories
      WHERE household_id = $1 AND kind = $2
        AND COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid) =
            COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND lower(name) = lower($4)
        AND status = 'active' AND deleted_at IS NULL
        ${excludeId ? 'AND id <> $5' : ''}
      LIMIT 1`,
    excludeId
      ? [householdId, input.kind, input.parentId ?? null, input.name, excludeId]
      : [householdId, input.kind, input.parentId ?? null, input.name],
  );
  if ((res.rowCount ?? 0) > 0) throw domainErrors.inUse('Categoria', 'nome duplicado');
};

/**
 * Centralized subcategory validation for expense/income writes (M-03).
 *
 * Enforces, inside the caller's transaction: same household, active status,
 * real subcategory (has a parent), kind compatible with the entry, and —
 * when the entry names a distinct parent category — that the subcategory
 * actually belongs to it. Returns the resolved subcategory row.
 */
export const resolveSubcategoryInTx = async (
  client: import('pg').PoolClient,
  householdId: string,
  subcategoryId: string,
  txKind: 'expense' | 'income',
  parentCategoryId?: string,
): Promise<Category> => {
  const sub = await findCategoryInHousehold(client, subcategoryId, householdId).catch(() => {
    throw domainErrors.notFound('Subcategoria');
  });
  if (sub.status !== 'active') throw domainErrors.notFound('Subcategoria');
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
 * Category check shared with the CardStore (M-05): a card purchase needs an
 * existing, active, expense-kind category — the same rule as plain entries.
 */
export const resolveExpenseCategoryInTx = async (
  client: import('pg').PoolClient,
  householdId: string,
  categoryId: string,
): Promise<Category> => {
  const cat = await findCategoryInHousehold(client, categoryId, householdId);
  if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
  // V4.1 Task 2.14: kind decision delegated to the central resolver.
  return assertCategoryKind(cat, 'expense', 'categoryId', CARD_EXPENSE_KIND_MESSAGE);
};

const findActiveTransaction = async (
  client: import('pg').PoolClient,
  id: string,
  householdId: string,
): Promise<Transaction> => {
  const res = await client.query<Row>(
    `SELECT id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id, transfer_to_account_id, notes
       FROM transactions
      WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
    [id, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Lançamento');
  return mapTransaction(res.rows[0]!);
};

/**
 * Reverses the balance effect of a transaction being soft-deleted (C-04).
 * Shared by softDeleteTransaction and category-cascade so both paths keep
 * balances consistent inside the same database transaction.
 *
 * V4.1 Phase 4 (D1 option B, Tasks 4.6–4.7): every leg locks its account
 * row (deterministic order) and debit legs validate instead of clamping —
 * reversing an income (or the destination leg of a transfer) that was
 * already spent fails with 400 instead of flooring the balance at zero.
 */
const reverseBalanceForDelete = async (
  client: import('pg').PoolClient,
  householdId: string,
  tx: Pick<Transaction, 'kind' | 'accountId' | 'amountCents'> & { transferToAccountId?: string },
): Promise<void> => {
  if (tx.kind === 'expense') {
    const locked = await lockAccountRow(client, tx.accountId, householdId);
    await client.query(
      `UPDATE accounts SET balance_cents = $2 WHERE id = $1 AND household_id = $3`,
      [tx.accountId, locked.balanceCents + tx.amountCents, householdId],
    );
  } else if (tx.kind === 'income') {
    const locked = await lockAccountRow(client, tx.accountId, householdId);
    assertSufficientFunds(locked.balanceCents, tx.amountCents);
    await client.query(
      `UPDATE accounts SET balance_cents = $2 WHERE id = $1 AND household_id = $3`,
      [tx.accountId, locked.balanceCents - tx.amountCents, householdId],
    );
  } else if (tx.kind === 'transfer') {
    const locked = await lockAccountsOrdered(
      client,
      householdId,
      tx.transferToAccountId ? [tx.accountId, tx.transferToAccountId] : [tx.accountId],
    );
    const from = locked.get(tx.accountId)!;
    const dest = tx.transferToAccountId ? locked.get(tx.transferToAccountId)! : null;
    // Validate the debit leg BEFORE any mutation so a rejection leaves
    // both sides untouched.
    if (dest) assertSufficientFunds(dest.balanceCents, tx.amountCents);
    await client.query(
      `UPDATE accounts SET balance_cents = $2 WHERE id = $1 AND household_id = $3`,
      [tx.accountId, from.balanceCents + tx.amountCents, householdId],
    );
    if (dest) {
      await client.query(
        `UPDATE accounts SET balance_cents = $2 WHERE id = $1 AND household_id = $3`,
        [tx.transferToAccountId, dest.balanceCents - tx.amountCents, householdId],
      );
    }
  }
};

/**
 * Idempotent catalog application inside an existing tx (M-02).
 *
 * Race-safe: INSERT ... ON CONFLICT DO NOTHING (functional unique index
 * from V048) + SELECT, with the same matching rule as the in-memory store:
 * same-kind macro with equal case-insensitive name is reused. Two
 * concurrent applications converge on the same rows; counts stay exact.
 *
 * Exported for unit tests (fake-client concurrency); production callers
 * use applyCategoryDefaults / the createAccount bootstrap.
 */
export const applyDefaultsInTx = async (
  client: import('pg').PoolClient,
  householdId: string,
): Promise<{ created: number; skipped: number }> => {
  let created = 0;
  let skipped = 0;
  for (const [macroIdx, macro] of DEFAULT_CATEGORY_CATALOG.entries()) {
    const ins = await client.query<Row>(
      `INSERT INTO categories (id, household_id, name, kind, status, parent_id, icon, color, sort_order, is_default, is_system)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', NULL, $4, $5, $6, true, false)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [householdId, macro.name, macro.kind, macro.icon, macro.color, macroIdx],
    );
    let macroId: string;
    if ((ins.rowCount ?? 0) === 1) {
      macroId = ins.rows[0]!['id'] as string;
      created += 1;
    } else {
      const found = await client.query<Row>(
        `SELECT id FROM categories
          WHERE household_id = $1 AND parent_id IS NULL AND kind = $2
            AND lower(name) = lower($3) AND status = 'active' AND deleted_at IS NULL
          LIMIT 1`,
        [householdId, macro.kind, macro.name],
      );
      macroId = found.rows[0]!['id'] as string;
      skipped += 1;
    }
    for (const sub of macro.subs) {
      const subIns = await client.query(
        `INSERT INTO categories (id, household_id, name, kind, status, parent_id, icon, color, sort_order, is_default, is_system)
         VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, NULL, 0, true, false)
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
 * Client-bound expense mutation (no transaction handling): shared by the
 * plain path (own tx) and the V2 key-idempotent path (record + mutation
 * in the SAME tx, see pending-idempotency.ts).
 */
const createExpenseInTx = async (
  client: import('pg').PoolClient,
  householdId: string,
  input: CreateExpenseInput,
): Promise<Transaction> => {
  // V4.1 Phase 4 Task 4.6: the paying account is locked before the
  // balance decision so concurrent expenses serialize on the row.
  const acc = await lockAccountRow(client, input.accountId, householdId);
  if (acc.status !== 'active') throw domainErrors.notFound('Conta');
  // H-01: card purchases must flow through the CardStore (statements,
  // limits, invoice semantics) — never as plain balance expenses.
  if (acc.kind === 'credit_card') {
    throw new DomainError('validation.invalid', 'compra no cartão deve usar /cards/purchases.', 422);
  }
  // V4.1 Phase 4 (D1 option B): no silent partial debit — an expense that
  // exceeds the balance fails with 400 like payables/cards.
  assertSufficientFunds(acc.balanceCents, input.amountCents);
  const cat = await findCategoryInHousehold(client, input.categoryId, householdId);
  if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
  // V4.1 Task 2.15: plain expenses require an expense-kind category —
  // same strictness as the card path (was: any active category accepted).
  assertCategoryKind(cat, 'expense');
  if (input.subcategoryId !== undefined) {
    await resolveSubcategoryInTx(client, householdId, input.subcategoryId, 'expense', input.categoryId);
  }
  const txRes = await client.query<Row>(
    `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id, notes)
     VALUES (gen_random_uuid(), $1, 'expense', $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [
      householdId,
      input.description,
      input.amountCents,
      input.date,
      input.accountId,
      input.categoryId,
      input.subcategoryId ?? null,
      input.notes ?? null,
    ],
  );
  await client.query(
    `UPDATE accounts
        SET balance_cents = balance_cents - $2
      WHERE id = $1 AND household_id = $3`,
    [input.accountId, input.amountCents, householdId],
  );

  return mapTransaction(txRes.rows[0]!);
};

/**
 * Client-bound income mutation (no transaction handling): shared by the
 * plain path and the V2 key-idempotent path.
 */
const createIncomeInTx = async (
  client: import('pg').PoolClient,
  householdId: string,
  input: CreateIncomeInput,
): Promise<Transaction> => {
  const acc = await findAccountInHousehold(client, input.accountId, householdId);
  if (acc.status !== 'active') throw domainErrors.notFound('Conta');
  // H-01: income on a credit card is rejected (422), not silently booked.
  if (acc.kind === 'credit_card') {
    throw new DomainError('validation.invalid', 'receita não pode usar cartão de crédito.', 422);
  }
  const cat = await findCategoryInHousehold(client, input.categoryId, householdId);
  if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
  // V4.1 Task 2.15: plain income requires an income-kind category.
  assertCategoryKind(cat, 'income');
  if (input.subcategoryId !== undefined) {
    await resolveSubcategoryInTx(client, householdId, input.subcategoryId, 'income', input.categoryId);
  }
  const txRes = await client.query<Row>(
    `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id, notes)
     VALUES (gen_random_uuid(), $1, 'income', $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${TRANSACTION_COLUMNS}`,
    [
      householdId,
      input.description,
      input.amountCents,
      input.date,
      input.accountId,
      input.categoryId,
      input.subcategoryId ?? null,
      input.notes ?? null,
    ],
  );
  await client.query(
    `UPDATE accounts SET balance_cents = balance_cents + $2 WHERE id = $1 AND household_id = $3`,
    [input.accountId, input.amountCents, householdId],
  );
  return mapTransaction(txRes.rows[0]!);
};

/**
 * Client-bound transfer mutation (no transaction handling).
 *
 * V4.1 Phase 3 Task 3.2: extracted from the inline store body so keyed
 * route producers can run the effect on the idempotency claim client
 * (single atomic commit) instead of opening an independent transaction.
 */
const createTransferInTx = async (
  client: import('pg').PoolClient,
  householdId: string,
  input: CreateTransferInput,
): Promise<Transaction> => {
  // V4.1 Phase 4 Tasks 4.6–4.7: both legs locked in deterministic (sorted)
  // order — opposite-direction concurrent transfers cannot deadlock.
  const locked = await lockAccountsOrdered(client, householdId, [input.fromAccountId, input.toAccountId]);
  const from = locked.get(input.fromAccountId)!;
  const to = locked.get(input.toAccountId)!;
  if (from.status !== 'active') throw domainErrors.notFound('Conta');
  if (to.status !== 'active') throw domainErrors.notFound('Conta');
  // H-01: transfers cannot touch credit cards (pay the invoice instead).
  if (from.kind === 'credit_card' || to.kind === 'credit_card') {
    throw new DomainError('validation.invalid', 'transferência não pode usar cartão de crédito.', 422);
  }
  // V4.1 Phase 4 (D1 option B): the debit is validated BEFORE either leg
  // moves — an over-balance transfer fails with 400 and changes NEITHER
  // side (was: GREATEST(0, …) debit + full credit = money creation).
  assertSufficientFunds(from.balanceCents, input.amountCents);
  const txRes = await client.query<Row>(
    `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, transfer_to_account_id)
     VALUES (gen_random_uuid(), $1, 'transfer', $2, $3, $4, $5, $6)
     RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
    [householdId, input.description, input.amountCents, input.date, input.fromAccountId, input.toAccountId],
  );
  await client.query(
    `UPDATE accounts
        SET balance_cents = balance_cents - $2
      WHERE id = $1 AND household_id = $3`,
    [input.fromAccountId, input.amountCents, householdId],
  );
  await client.query(
    `UPDATE accounts SET balance_cents = balance_cents + $2 WHERE id = $1 AND household_id = $3`,
    [input.toAccountId, input.amountCents, householdId],
  );
  return mapTransaction(txRes.rows[0]!);
};

/**
 * Client-bound account creation (no transaction handling): shared by the
 * plain path (own tx) and idempotency producers that join the claim
 * transaction (FIX-UNDO atomic path, 0.4.1 rollback proof).
 *
 * Exported so idempotency producers under test can run inside the passed
 * claim client instead of opening an independent transaction.
 */
export const createAccountInTx = async (
  client: PoolClient,
  householdId: string,
  input: CreateAccountInput,
): Promise<Account> => {
  const res = await client.query<Row>(
    `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active')
      RETURNING id, household_id, name, kind, balance_cents, status`,
    [householdId, input.name, input.kind, input.initialBalanceCents],
  );
  // Item 11: bootstrap the default set for households without categories.
  const existing = await client.query(
    `SELECT 1 FROM categories WHERE household_id = $1 AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
    [householdId],
  );
  if ((existing.rowCount ?? 0) === 0) {
    await applyDefaultsInTx(client, householdId);
  }
  return mapAccount(res.rows[0]!);
};

/**
 * Client-bound account deactivation (no transaction handling).
 * FIX-UNDO: lets the `accounts.create` undo reversal join the claim tx.
 */
const deactivateAccountInTx = async (
  client: PoolClient,
  householdId: string,
  id: string,
): Promise<Account> => {
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
};

/**
 * Client-bound category deactivation (no transaction handling).
 * FIX-UNDO: lets the `categories.create` undo reversal join the claim tx.
 */
const deactivateCategoryInTx = async (
  client: PoolClient,
  householdId: string,
  id: string,
): Promise<Category> => {
  const existing = await findCategoryInHousehold(client, id, householdId);
  if (existing.status !== 'active') throw domainErrors.notFound('Categoria');
  const used = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
        FROM transactions
       WHERE household_id = $1
         AND deleted_at IS NULL
         AND (category_id = $2 OR subcategory_id = $2)`,
    [householdId, id],
  );
  if (Number(used.rows[0]!.count) > 0) {
    throw domainErrors.inUse('Categoria', 'lançamentos');
  }
  const res = await client.query<Row>(
    `UPDATE categories
        SET status = 'inactive'
      WHERE id = $1 AND household_id = $2
      RETURNING ${CATEGORY_COLUMNS}`,
    [id, householdId],
  );
  return mapCategory(res.rows[0]!);
};

/**
 * Client-bound transaction soft-delete (no transaction handling).
 * FIX-UNDO: lets the `transactions.*.create` undo reversal join the
 * claim tx instead of opening an independent transaction.
 */
const softDeleteTransactionInTx = async (
  client: PoolClient,
  householdId: string,
  id: string,
): Promise<Transaction> => {
  const tx = await findActiveTransaction(client, id, householdId);
  // V4.1 REVIEWFIX F3: never tombstone a paid payable's payment effect
  // directly — the undo path owns that reversal.
  await assertNotLinkedToPaidPayable(client, householdId, id);
  // Restore balance effect (shared with category cascade, C-04).
  await reverseBalanceForDelete(client, householdId, tx);  const res = await client.query<Row>(
    `UPDATE transactions
        SET deleted_at = NOW()
      WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL
      RETURNING id, household_id, kind, description, amount_cents, date, account_id, category_id, transfer_to_account_id`,
    [id, householdId],
  );
  if (res.rowCount === 0) throw domainErrors.notFound('Lançamento');
  return mapTransaction(res.rows[0]!);
};

/**
 * FIX-UNDO (F3, SPEC §12 F3 opção 1): non-contractual client-bound
 * reversal extensions of the Postgres write store. The undo service
 * duck-types these (with fallback to the plain transactional methods)
 * when its idempotency producer receives the claim transaction client,
 * so claim + financial reversal + completion commit atomically.
 * NOT part of `WriteStore` — existing callers are unaffected.
 */
export type PostgresReversalTxExtensions = {
  softDeleteTransactionInTx(client: PoolClient, householdId: string, id: string): Promise<Transaction>;
  deactivateAccountInTx(client: PoolClient, householdId: string, id: string): Promise<Account>;
  deactivateCategoryInTx(client: PoolClient, householdId: string, id: string): Promise<Category>;
};

/**
 * V4.1 Phase 3 Task 3.2 — non-contractual client-bound financial mutations
 * of the Postgres write stores (canonical AND legacy, same member names).
 * Keyed route producers (see writes/keyed-mutations.ts) duck-type these and
 * run the effect on the open idempotency claim client, so claim + financial
 * effect + receipt/completion commit atomically in ONE transaction.
 * NOT part of `WriteStore` — existing callers are unaffected.
 */
export type WriteStoreMutationTxExtensions = {
  createExpenseInTx(client: PoolClient, householdId: string, input: CreateExpenseInput): Promise<Transaction>;
  createIncomeInTx(client: PoolClient, householdId: string, input: CreateIncomeInput): Promise<Transaction>;
  createTransferInTx(client: PoolClient, householdId: string, input: CreateTransferInput): Promise<Transaction>;
  updateTransactionInTx(client: PoolClient, householdId: string, id: string, patch: UpdateTransactionInput): Promise<Transaction>;
};

/**
 * Client-bound transaction patch (no transaction handling).
 *
 * V4.1 Phase 3 Task 3.2: extracted verbatim from the inline store body so
 * keyed route producers can run the effect on the idempotency claim client
 * (single atomic commit) instead of opening an independent transaction.
 */
const updateTransactionInTx = async (
  client: PoolClient,
  householdId: string,
  id: string,
  patch: UpdateTransactionInput,
): Promise<Transaction> => {
  const tx = await findActiveTransaction(client, id, householdId);
  // V4.1 REVIEWFIX F3: a paid payable's payment effect is immutable
  // via PATCH — use unpay (which clears the link first).
  await assertNotLinkedToPaidPayable(client, householdId, id);
  if (tx.kind === 'transfer') {
    if (
      patch.amountCents !== undefined ||
      patch.accountId !== undefined ||
      patch.categoryId !== undefined ||
      patch.subcategoryId !== undefined ||
      patch.notes !== undefined
    ) {
      // V4.1 SPEC §9.7: restricted transfer fields are a contract
      // violation (422), not a malformed body.
      throw new DomainError(
        'unsupported',
        'Operação não suportada: transferências só podem ter descrição e data alteradas.',
        422,
      );
    }
    if (patch.description === undefined && patch.date === undefined) return tx;
    const res = await client.query<Row>(
      `UPDATE transactions
          SET description = COALESCE($3, description),
              date        = COALESCE($4, date)
        WHERE id = $1 AND household_id = $2
        RETURNING ${TRANSACTION_COLUMNS}`,
      [id, householdId, patch.description ?? null, patch.date ?? null],
    );
    return mapTransaction(res.rows[0]!);
  }
  // expense / income
  if (patch.description === undefined && patch.date === undefined && patch.amountCents === undefined && patch.accountId === undefined && patch.categoryId === undefined && patch.subcategoryId === undefined && patch.notes === undefined) {
    return tx;
  }
  if (patch.amountCents !== undefined && patch.amountCents <= 0) {
    throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
  }
  // V4.1 Phase 4 (Tasks 4.4–4.7): delta engine — compute the effective
  // after-state, lock the affected accounts in deterministic order,
  // validate (D1: no account may end negative; H-01: no credit-card leg),
  // then reverse(before) + apply(after) exactly once. Validation runs
  // before any balance UPDATE; a rejection rolls the tx back untouched.
  const balanceTouched =
    patch.amountCents !== undefined ||
    (patch.accountId !== undefined && patch.accountId !== tx.accountId);
  const newAmount = patch.amountCents ?? tx.amountCents;
  const newAccountId = patch.accountId ?? tx.accountId;
  if (balanceTouched) {
    const locked = await lockAccountsOrdered(client, householdId, [tx.accountId, newAccountId]);
    const oldAcc = locked.get(tx.accountId)!;
    const newAcc = locked.get(newAccountId)!;
    if (newAcc.status !== 'active') throw domainErrors.notFound('Conta');
    if (newAcc.kind === 'credit_card') {
      throw new DomainError(
        'validation.invalid',
        tx.kind === 'income'
          ? 'receita não pode usar cartão de crédito.'
          : 'compra no cartão deve usar /cards/purchases.',
        422,
      );
    }
    const reverseDelta = tx.kind === 'expense' ? tx.amountCents : -tx.amountCents;
    const applyDelta = tx.kind === 'expense' ? -newAmount : newAmount;
    if (newAccountId === tx.accountId) {
      const final = oldAcc.balanceCents + reverseDelta + applyDelta;
      if (final < 0) {
        throw domainErrors.invalid('amountCents', 'saldo insuficiente na conta de origem');
      }
      await client.query(
        `UPDATE accounts SET balance_cents = $2 WHERE id = $1 AND household_id = $3`,
        [tx.accountId, final, householdId],
      );
    } else {
      const oldFinal = oldAcc.balanceCents + reverseDelta;
      const newFinal = newAcc.balanceCents + applyDelta;
      if (oldFinal < 0 || newFinal < 0) {
        throw domainErrors.invalid('amountCents', 'saldo insuficiente na conta de origem');
      }
      await client.query(
        `UPDATE accounts SET balance_cents = $2 WHERE id = $1 AND household_id = $3`,
        [tx.accountId, oldFinal, householdId],
      );
      await client.query(
        `UPDATE accounts SET balance_cents = $2 WHERE id = $1 AND household_id = $3`,
        [newAccountId, newFinal, householdId],
      );
    }
  } else if (patch.accountId !== undefined) {
    // Same-account no-op patch: still validate the target.
    const same = await findAccountInHousehold(client, patch.accountId, householdId);
    if (same.status !== 'active') throw domainErrors.notFound('Conta');
  }
  if (patch.categoryId !== undefined) {
    const next = await findCategoryInHousehold(client, patch.categoryId, householdId);
    if (next.status !== 'active') throw domainErrors.notFound('Categoria');
    // V4.1 Task 2.15: PATCH keeps the entry kind — the new category
    // must match it (this branch only runs for expense/income).
    assertCategoryKind(next, tx.kind === 'income' ? 'income' : 'expense');
  }
  // Effective parent for subcategory coherence (M-03): an explicit
  // subcategory is validated against the effective parent; when only
  // the parent changes, a retained subcategory from another macro is
  // cleared instead of persisting an incoherent tree.
  const effectiveCategoryId = patch.categoryId ?? tx.categoryId;
  let effectiveSubcategoryId: string | null | undefined = patch.subcategoryId;
  if (
    effectiveSubcategoryId === undefined &&
    patch.categoryId !== undefined &&
    tx.subcategoryId !== undefined &&
    patch.categoryId !== tx.categoryId
  ) {
    effectiveSubcategoryId = null;
  }
  if (effectiveSubcategoryId !== undefined && effectiveSubcategoryId !== null) {
    await resolveSubcategoryInTx(client, householdId, effectiveSubcategoryId, tx.kind === 'income' ? 'income' : 'expense', effectiveCategoryId);
  }
  // Balance legs were already reversed/applied exactly once by the
  // delta engine above; the row UPDATE below only persists the new
  // amount/account references.
  const res = await client.query<Row>(
    `UPDATE transactions
        SET description = COALESCE($3, description),
            date        = COALESCE($4, date),
            amount_cents = COALESCE($5, amount_cents),
            account_id  = COALESCE($6, account_id),
            category_id = COALESCE($7, category_id),
            subcategory_id = CASE WHEN $10 THEN NULL ELSE COALESCE($8, subcategory_id) END,
            notes = COALESCE($9, notes)
      WHERE id = $1 AND household_id = $2
      RETURNING ${TRANSACTION_COLUMNS}`,
    [
      id, householdId,
      patch.description ?? null,
      patch.date ?? null,
      patch.amountCents ?? null,
      patch.accountId ?? null,
      patch.categoryId ?? null,
      patch.subcategoryId ?? null,
      patch.notes ?? null,
      effectiveSubcategoryId === null,
    ],
  );
  return mapTransaction(res.rows[0]!);
};

export const createPostgresWriteStore = (opts: { pool: Pool }): WriteStore => {
  const { pool } = opts;

  const store: WriteStore = {
    async createAccount(householdId, input) {
      return withTransaction(pool, async (client) => createAccountInTx(client, householdId, input));
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
      return withTransaction(pool, async (client) => deactivateAccountInTx(client, householdId, id));
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
        await assertCategoryNameFree(client, householdId, {
          name: input.name,
          kind: input.kind,
          ...(input.parentId ? { parentId: input.parentId } : {}),
        });
        const res = await client.query<Row>(
          `INSERT INTO categories (id, household_id, name, kind, status, parent_id, icon, color, sort_order, is_default, is_system)
           VALUES (gen_random_uuid(), $1, $2, $3, 'active', $4, $5, $6, $7, $8, false)
           RETURNING ${CATEGORY_COLUMNS}`,
          [
            householdId,
            input.name,
            input.kind,
            input.parentId ?? null,
            input.icon ?? null,
            input.color ?? null,
            input.sortOrder ?? 0,
            input.isDefault ?? false,
          ],
        );
        return mapCategory(res.rows[0]!);
      });
    },

    async updateCategory(householdId, id, patch) {
      return withTransaction(pool, async (client) => {
        const existing = await findCategoryInHousehold(client, id, householdId);
        if (existing.status !== 'active') throw domainErrors.notFound('Categoria');
        if (patch.name !== undefined) {
          await assertCategoryNameFree(
            client,
            householdId,
            { name: patch.name, kind: existing.kind, ...(existing.parentId ? { parentId: existing.parentId } : {}) },
            id,
          );
        }
        const res = await client.query<Row>(
          `UPDATE categories
              SET name = COALESCE($3, name),
                  icon = COALESCE($4, icon),
                  color = COALESCE($5, color),
                  sort_order = COALESCE($6, sort_order),
                  is_default = COALESCE($7, is_default)
            WHERE id = $1 AND household_id = $2
           RETURNING ${CATEGORY_COLUMNS}`,
          [
            id,
            householdId,
            patch.name ?? null,
            patch.icon ?? null,
            patch.color ?? null,
            patch.sortOrder ?? null,
            patch.isDefault ?? null,
          ],
        );
        return mapCategory(res.rows[0]!);
      });
    },

    async deactivateCategory(householdId, id) {
      return withTransaction(pool, async (client) => deactivateCategoryInTx(client, householdId, id));
    },

    async deleteCategory(householdId, id, input) {
      return withTransaction(pool, async (client) => {
        const cat = await findCategoryInHousehold(client, id, householdId);
        if (cat.status !== 'active') throw domainErrors.notFound('Categoria');
        const subs = await client.query<Row>(
          `SELECT ${CATEGORY_COLUMNS} FROM categories
            WHERE household_id = $1 AND parent_id = $2 AND status = 'active' AND deleted_at IS NULL`,
          [householdId, id],
        );
        const scopeIds = [id, ...subs.rows.map((r) => r['id'] as string)];
        const referencing = await client.query<Row>(
          `SELECT ${TRANSACTION_COLUMNS} FROM transactions
            WHERE household_id = $1 AND deleted_at IS NULL
              AND (category_id = ANY($2) OR subcategory_id = ANY($2))`,
          [householdId, scopeIds],
        );
        let movedTransactions = 0;
        let softDeletedTransactions = 0;
        if (input.mode === 'move') {
          if (!input.destinationCategoryId) {
            throw domainErrors.invalid('destinationCategoryId', 'destino é obrigatório no modo move');
          }
          const dest = await findCategoryInHousehold(client, input.destinationCategoryId, householdId);
          if (dest.status !== 'active') throw domainErrors.notFound('Categoria de destino');
          if (dest.kind !== cat.kind) {
            throw domainErrors.invalid('destinationCategoryId', 'destino deve ter o mesmo kind');
          }
          if (scopeIds.includes(dest.id)) {
            throw domainErrors.invalid('destinationCategoryId', 'destino não pode ser a categoria excluída');
          }
          await client.query(
            `UPDATE transactions SET category_id = $3
              WHERE household_id = $1 AND deleted_at IS NULL AND category_id = ANY($2)`,
            [householdId, scopeIds, dest.id],
          );
          await client.query(
            `UPDATE transactions SET subcategory_id = NULL
              WHERE household_id = $1 AND deleted_at IS NULL AND subcategory_id = ANY($2)`,
            [householdId, scopeIds],
          );
          movedTransactions = referencing.rowCount ?? 0;
        } else {
          if (input.confirm !== true) {
            throw domainErrors.invalid('confirm', 'exclusão em cascata exige confirm:true');
          }
          // C-04: every cascaded record goes through the same balance
          // reversal as softDeleteTransaction, inside this transaction.
          const doomed = await client.query<Row>(
            `SELECT kind, account_id, amount_cents, transfer_to_account_id FROM transactions
              WHERE household_id = $1 AND deleted_at IS NULL
                AND (category_id = ANY($2) OR subcategory_id = ANY($2))`,
            [householdId, scopeIds],
          );
          for (const row of doomed.rows) {
            await reverseBalanceForDelete(client, householdId, {
              kind: row['kind'] as Transaction['kind'],
              accountId: row['account_id'] as string,
              amountCents: Number(row['amount_cents']),
              ...(row['transfer_to_account_id'] != null
                ? { transferToAccountId: row['transfer_to_account_id'] as string }
                : {}),
            });
          }
          await client.query(
            `UPDATE transactions SET deleted_at = NOW()
              WHERE household_id = $1 AND deleted_at IS NULL
                AND (category_id = ANY($2) OR subcategory_id = ANY($2))`,
            [householdId, scopeIds],
          );
          softDeletedTransactions = referencing.rowCount ?? 0;
        }
        await client.query(
          `UPDATE categories SET status = 'inactive'
            WHERE household_id = $1 AND id = ANY($2)`,
          [householdId, scopeIds],
        );
        return { deletedCategoryIds: scopeIds, movedTransactions, softDeletedTransactions };
      });
    },

    async applyCategoryDefaults(householdId) {
      return withTransaction(pool, async (client) => applyDefaultsInTx(client, householdId));
    },

    async createExpense(householdId, input, options) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      if (options?.idempotencyKey === undefined) {
        return withTransaction(pool, async (client) => createExpenseInTx(client, householdId, input));
      }
      // P1: V2 execution records (key → transaction) in the SAME tx as the
      // mutation, so a retry after partial failure replays instead of
      // duplicating.
      return runKeyedMutation({
        pool,
        householdId,
        idempotencyKey: options.idempotencyKey,
        payload: input,
        mutate: (client) => createExpenseInTx(client, householdId, input),
      });
    },

    async createIncome(householdId, input, options) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      if (options?.idempotencyKey === undefined) {
        return withTransaction(pool, async (client) => createIncomeInTx(client, householdId, input));
      }
      return runKeyedMutation({
        pool,
        householdId,
        idempotencyKey: options.idempotencyKey,
        payload: input,
        mutate: (client) => createIncomeInTx(client, householdId, input),
      });
    },

    async createTransfer(householdId, input) {
      if (input.amountCents <= 0) throw domainErrors.invalid('amountCents', 'deve ser maior que zero');
      if (input.fromAccountId === input.toAccountId) {
        throw domainErrors.invalid('toAccountId', 'deve ser diferente da conta de origem');
      }
      return withTransaction(pool, async (client) => createTransferInTx(client, householdId, input));
    },

    async updateTransaction(householdId, id, patch) {
      return withTransaction(pool, async (client) => updateTransactionInTx(client, householdId, id, patch));
    },

    async softDeleteTransaction(householdId, id) {
      return withTransaction(pool, async (client) => softDeleteTransactionInTx(client, householdId, id));
    },
  };
  // FIX-UNDO: expose the client-bound reversals as non-contractual
  // extensions (see PostgresReversalTxExtensions). The declared factory
  // return type stays WriteStore, so existing callers are unaffected.
  return Object.assign(store, {
    softDeleteTransactionInTx,
    deactivateAccountInTx,
    deactivateCategoryInTx,
    // V4.1 Phase 3 Task 3.2: client-bound financial mutations so keyed
    // route producers run the effect on the idempotency claim client
    // (claim + effect + completion in ONE transaction). See
    // WriteStoreMutationTxExtensions; not part of WriteStore.
    createExpenseInTx,
    createIncomeInTx,
    createTransferInTx,
    updateTransactionInTx,
  });
};

/**
 * Postgres idempotency store. TTL 24h, lazy eviction on lookup.
 */

type SettledClaimRow = {
  id: string;
  status: string;
  response: unknown;
  payload_hash: string;
  lease_until: Date | string | null;
};

/**
 * Finding 3: explicit `processing` handling for a lost claim race.
 *
 * - `completed` → replay the recorded response.
 * - `processing` with a live lease → another worker owns the claim: an
 *   explicit 409 `idempotency.in_progress` (never a null-response replay,
 *   which 500s the route).
 * - `processing` with an expired lease → take over the claim in this tx
 *   (single-winner via the status+lease predicate) and return the record id
 *   so the caller runs the producer through the normal completion path.
 * - `failed`, payload mismatch, or a lost takeover race → 409 conflict
 *   (existing behavior; the race loser never runs the producer).
 */
const resolveLostClaimRace = async (
  client: PoolClient,
  householdId: string,
  compositeKey: string,
  payload: unknown,
  payloadHash: string,
): Promise<{ response: unknown } | { recordId: string }> => {
  const readSettled = () =>
    client.query<SettledClaimRow>(
      `SELECT id, status, response, payload_hash, lease_until
         FROM operation_records
        WHERE workspace_id = $1 AND idempotency_key = $2`,
      [householdId, compositeKey],
    );
  const settled = await readSettled();
  if (settled.rowCount === 0) throw domainErrors.idempotencyConflict();
  const row = settled.rows[0]!;
  if (row.status === 'failed') throw domainErrors.idempotencyConflict();
  if (!matchesPayloadHash(row.payload_hash, payload)) throw domainErrors.idempotencyConflict();
  if (row.status === 'completed') return { response: row.response };
  const leaseMs = row.lease_until ? new Date(row.lease_until).getTime() : 0;
  if (leaseMs > Date.now()) throw domainErrors.idempotencyInProgress();
  const takeover = await client.query<{ id: string }>(
    `UPDATE operation_records
        SET status = 'processing', payload_hash = $3,
            lease_until = NOW() + INTERVAL '5 minutes',
            retry_until = NOW() + INTERVAL '7 days',
            retention_until = NOW() + INTERVAL '90 days'
      WHERE workspace_id = $1 AND idempotency_key = $2
        AND status = 'processing' AND lease_until <= NOW()
      RETURNING id`,
    [householdId, compositeKey, payloadHash],
  );
  if (takeover.rowCount === 1) return { recordId: takeover.rows[0]!.id };
  const reread = await readSettled();
  const latest = reread.rows[0];
  if (latest && latest.status === 'completed' && matchesPayloadHash(latest.payload_hash, payload)) {
    return { response: latest.response };
  }
  if (latest && latest.status === 'processing') throw domainErrors.idempotencyInProgress();
  throw domainErrors.idempotencyConflict();
};

export const createPostgresIdempotencyStore = (opts: { pool: Pool; legacy?: boolean }): import('./idempotency.js').IdempotencyStore => {
  const { pool, legacy } = opts;
  // V4.1 Phase 3 Tasks 3.6/3.7: new claims hash V2 (SHA-256 over canonical
  // JSON). Rows written by older builds (v1-sha256 / legacy h*31) still
  // replay — reads compare tolerantly via matchesPayloadHash.
  const hash = (payload: unknown): string => hashPayloadV2(payload);
  return {
    async lookupOrRecord(scopeOrHouseholdId: any, keyOrPayload: any, payloadOrProducer: any, maybeProducer?: any) {
      let householdId: string;
      let key: string;
      let payload: unknown;
      let producer: IdempotencyProducer<any>;
      let operation: string | undefined;
      let actorId: string | undefined;

      if (typeof scopeOrHouseholdId === 'object' && scopeOrHouseholdId !== null) {
        householdId = scopeOrHouseholdId.householdId ?? scopeOrHouseholdId.workspaceId;
        key = scopeOrHouseholdId.key;
        operation = scopeOrHouseholdId.operation;
        actorId = scopeOrHouseholdId.actorId;
        payload = keyOrPayload;
        producer = payloadOrProducer;
      } else {
        householdId = scopeOrHouseholdId;
        key = keyOrPayload;
        payload = payloadOrProducer;
        producer = maybeProducer;
      }

      // Canonical composite key: raw key for the legacy string form,
      // buildIdempotencyKey for the request-object form (same as in-memory).
      const compositeKey = typeof scopeOrHouseholdId === 'object' && scopeOrHouseholdId !== null
        ? buildIdempotencyKey(scopeOrHouseholdId as never)
        : key;

      const payloadHash = hash(payload);
      return withTransaction(pool, async (client) => {
        if (legacy) {
          // Hybrid VPS: operation_records is CANONICAL, audit_logs is LEGACY
          const claim = await client.query<{ id: string; status: string; response: unknown; effect_ref: string | null }>(
            `INSERT INTO operation_records
               (workspace_id, actor_id, operation, idempotency_key, payload_hash, status,
                lease_until, retry_until, retention_until)
             VALUES ($1, $2, $3, $4, $5, 'processing',
                     NOW() + INTERVAL '5 minutes', NOW() + INTERVAL '7 days', NOW() + INTERVAL '90 days')
             ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
             RETURNING id, status, response, effect_ref`,
            [householdId, actorId ?? 'unknown', operation ?? 'write', compositeKey, payloadHash],
          );

          if (claim.rowCount === 1) {
            const recordId = claim.rows[0]!.id;
            // FIX-UNDO: the producer receives the open claim client, so a
            // client-bound effect (undo reversals, InTx helpers) joins this
            // transaction and commits atomically with claim + completion.
            // Producers that ignore the argument keep their own boundary.
            const response = await producer(client);
            const effectRef = (response as { transactionId?: string } | null)?.transactionId ?? null;
            await client.query(
              `UPDATE operation_records
                  SET status = 'completed', response = $3, effect_ref = $4, completed_at = NOW()
                WHERE id = $1 AND workspace_id = $2`,
              [recordId, householdId, JSON.stringify(response), effectRef],
            );
const resolvedUserId = await resolveApplicationUserId(client, actorId);
            // The idempotency scope id may be a synthetic UUID (workspace.create,
            // account-invite.create) that is not a real household. audit_logs has an
            // FK to households(id); resolve the real household when it exists and
            // fall back to NULL (nullable column, as push notifications use).
            const resolvedHouseholdId = await resolveHouseholdId(client, householdId);
            await client.query(
              `INSERT INTO audit_logs
                 (id, household_id, user_id, action, entity_type, entity_id, before_json, after_json, created_at)
               VALUES ($1, $2, $3, $4, 'operation', $5, $6, $7, NOW())`,
[randomUUID(), resolvedHouseholdId, resolvedUserId, operation ?? 'write', recordId, null, JSON.stringify(response)],
            );
            return { response, replayed: false };
          }

          // Lost the claim race: explicit processing handling (Finding 3) —
          // completed replays, live-lease processing 409s, expired-lease
          // processing is taken over below via the normal completion path.
          const lost = await resolveLostClaimRace(client, householdId, compositeKey, payload, payloadHash);
          if ('response' in lost) return { response: lost.response as never, replayed: true };
          {
            const recordId = lost.recordId;
            const response = await producer(client);
            const effectRef = (response as { transactionId?: string } | null)?.transactionId ?? null;
            await client.query(
              `UPDATE operation_records
                  SET status = 'completed', response = $3, effect_ref = $4, completed_at = NOW()
                WHERE id = $1 AND workspace_id = $2`,
              [recordId, householdId, JSON.stringify(response), effectRef],
            );
            const resolvedUserId = await resolveApplicationUserId(client, actorId);
            const resolvedHouseholdId = await resolveHouseholdId(client, householdId);
            await client.query(
              `INSERT INTO audit_logs
                 (id, household_id, user_id, action, entity_type, entity_id, before_json, after_json, created_at)
               VALUES ($1, $2, $3, $4, 'operation', $5, $6, $7, NOW())`,
              [randomUUID(), resolvedHouseholdId, resolvedUserId, operation ?? 'write', recordId, null, JSON.stringify(response)],
            );
            return { response, replayed: false };
          }
        }

        // Canonical path: claim + effect + completion + audit in one
        // transaction against operation_records (V013-V016 lifecycle).
        const entityType = (operation ?? 'write').split('.')[0]!.replace(/s$/, '');
        const claim = await client.query<{ id: string; status: string; response: unknown; effect_ref: string | null }>(
          `INSERT INTO operation_records
             (workspace_id, actor_id, operation, idempotency_key, payload_hash, status,
              lease_until, retry_until, retention_until)
           VALUES ($1, $2, $3, $4, $5, 'processing',
                   NOW() + INTERVAL '5 minutes', NOW() + INTERVAL '7 days', NOW() + INTERVAL '90 days')
           ON CONFLICT (workspace_id, idempotency_key) DO NOTHING
           RETURNING id, status, response, effect_ref`,
          [householdId, actorId ?? 'device', operation ?? 'write', compositeKey, payloadHash],
        );

        if (claim.rowCount === 1) {
          const recordId = claim.rows[0]!.id;
          // FIX-UNDO: same claim-client passthrough as the legacy branch —
          // the undo reversal joins this transaction (SPEC §12 F3 opção 1).
          const response = await producer(client);
          const effectRef = (response as { transactionId?: string } | null)?.transactionId ?? null;
          await client.query(
            `UPDATE operation_records
                SET status = 'completed', response = $3, effect_ref = $4, completed_at = NOW()
              WHERE id = $1 AND workspace_id = $2`,
            [recordId, householdId, JSON.stringify(response), effectRef],
          );
          await client.query(
            `INSERT INTO audit_logs
               (id, operation_record_id, workspace_id, actor_id, operation, event_type, payload_hash, effect_ref, metadata)
             VALUES ($1, $2, $3, $4, $5, 'financial_effect.committed', $6, $7, $8)`,
            [
              randomUUID(),
              recordId,
              householdId,
              actorId ?? 'device',
              operation ?? 'write',
              payloadHash,
              effectRef,
              JSON.stringify({ entityType }),
            ],
          );
          return { response, replayed: false };
        }

        // Lost the claim race: explicit processing handling (Finding 3) —
        // completed replays, live-lease processing 409s, expired-lease
        // processing is taken over below via the normal completion path.
        const lost = await resolveLostClaimRace(client, householdId, compositeKey, payload, payloadHash);
        if ('response' in lost) return { response: lost.response as never, replayed: true };
        {
          const recordId = lost.recordId;
          const response = await producer(client);
          const effectRef = (response as { transactionId?: string } | null)?.transactionId ?? null;
          await client.query(
            `UPDATE operation_records
                SET status = 'completed', response = $3, effect_ref = $4, completed_at = NOW()
              WHERE id = $1 AND workspace_id = $2`,
            [recordId, householdId, JSON.stringify(response), effectRef],
          );
          await client.query(
            `INSERT INTO audit_logs
               (id, operation_record_id, workspace_id, actor_id, operation, event_type, payload_hash, effect_ref, metadata)
             VALUES ($1, $2, $3, $4, $5, 'financial_effect.committed', $6, $7, $8)`,
            [
              randomUUID(),
              recordId,
              householdId,
              actorId ?? 'device',
              operation ?? 'write',
              payloadHash,
              effectRef,
              JSON.stringify({ entityType }),
            ],
          );
          return { response, replayed: false };
        }
      });
    },
    clear: () => {
      throw new Error('clear() is not supported on the Postgres idempotency store; use TRUNCATE if needed');
    },
  };
};

