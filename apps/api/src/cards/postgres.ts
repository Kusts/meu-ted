/**
 * Postgres implementation of CardStore.
 *
 * Uses the V004 schema (statements table, credit_limit_cents /
 * closing_day / due_day on accounts, installments_total /
 * installment_number / statement_id on transactions).
 */

import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Account, Transaction, Statement, StatementPurchase, RecurringPurchase } from '../types/domain.js';
import type { CardStore } from './store.js';
import { withTransaction } from '../db/pool.js';
import { domainErrors } from '../writes/errors.js';
import { resolveExpenseCategoryInTx, resolveSubcategoryInTx } from '../writes/postgres.js';
import { installmentDates } from '../shared/billing-month.js';
import { splitInstallmentAmounts } from './installments.js';

type Row = Record<string, unknown>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Statement helpers (adapted for kind='credit_card') ───────────

function getClosingDate(purchaseDate: string, closingDay: number): string {
  const d = new Date(purchaseDate + 'T00:00:00.000Z');
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  if (d.getUTCDate() > closingDay) { m += 1; if (m > 11) { m = 0; y += 1; } }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(closingDay, lastDay);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDueDate(closingDate: string, dueDay: number): string {
  const d = new Date(closingDate + 'T00:00:00.000Z');
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth();
  const cDay = d.getUTCDate();
  if (dueDay <= cDay) { m += 1; if (m > 11) { m = 0; y += 1; } }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(dueDay, lastDay);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function computeStatus(s: Statement, today: string): Statement['status'] {
  if (s.status === 'cancelled') return 'cancelled';
  if (s.paidCents >= s.totalCents) return 'paid';
  if (s.paidCents > 0 && today > s.dueDate) return 'overdue';
  if (s.paidCents > 0) return 'partial';
  if (today > s.dueDate) return 'overdue';
  if (today >= s.closingDate) return 'closed';
  return 'open';
}

/**
 * Find-or-create the statement for a card cycle (H-04).
 *
 * Race-safe: INSERT ... ON CONFLICT DO NOTHING (unique index on
 * household/account/cycle from V047) followed by SELECT, so two concurrent
 * purchases in the same cycle converge on a single statement instead of
 * duplicating it.
 */
export const findOrCreateStatementTx = async (
  client: { query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> },
  householdId: string,
  accountId: string,
  cycle: string,
  closing: string,
  due: string,
): Promise<string> => {
  await client.query(
    `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, paid_cents, status)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, 0, 'open')
      ON CONFLICT (household_id, account_id, cycle_year_month) DO NOTHING`,
    [householdId, accountId, cycle, closing, due],
  );
  const found = await client.query(
    `SELECT id FROM statements WHERE account_id = $1 AND household_id = $2 AND cycle_year_month = $3 FOR UPDATE`,
    [accountId, householdId, cycle],
  );
  const id = found.rows[0]?.['id'] as string | undefined;
  if (!id) throw new Error('statement upsert did not converge');
  return id;
};
/** Helper: spread conditional optional properties to satisfy exactOptionalPropertyTypes. */
function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

type TxClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
};

/**
 * Task 2.8 (SPEC §9.4): lock the statement row before recomputing its
 * total so concurrent purchases serialize instead of lost-updating.
 */
const lockStatementForUpdateTx = async (
  client: TxClient,
  statementId: string,
  householdId: string,
): Promise<Statement> => {
  const res = await client.query(
    `SELECT * FROM statements WHERE id = $1 AND household_id = $2 FOR UPDATE`,
    [statementId, householdId],
  );
  if (res.rowCount === 0 || res.rows.length === 0) throw domainErrors.notFound('Fatura');
  return mapStatement(res.rows[0]!);
};

/** Recompute SUM(transactions) → persist total + status under the row lock. */
const recalcStatementLockedTx = async (
  client: TxClient,
  statementId: string,
  householdId: string,
): Promise<void> => {
  const stmt = await lockStatementForUpdateTx(client, statementId, householdId);
  const totalResult = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions WHERE statement_id = $1 AND household_id = $2 AND deleted_at IS NULL`,
    [statementId, householdId],
  );
  const total = Number(totalResult.rows[0]!['total']);
  const newStatus = computeStatus({ ...stmt, totalCents: total }, todayISO());
  await client.query(
    `UPDATE statements SET total_cents = $1, status = $2, updated_at = NOW() WHERE id = $3 AND household_id = $4`,
    [total, newStatus, statementId, householdId],
  );
};

// ── Row mappers ──────────────────────────────────────────────────

const mapAccount = (r: Row): Account => opt<Account>(
  {
    id: r['id'] as string,
    householdId: r['household_id'] as string,
    name: r['name'] as string,
    kind: r['kind'] as Account['kind'],
    balanceCents: Number(r['balance_cents']),
    status: r['status'] as Account['status'],
  },
  {
    creditLimitCents: r['credit_limit_cents'] != null ? Number(r['credit_limit_cents']) : undefined,
    closingDay: r['closing_day'] != null ? Number(r['closing_day']) : undefined,
    dueDay: r['due_day'] != null ? Number(r['due_day']) : undefined,
  } as Partial<Account>,
);

const mapStatement = (r: Row): Statement => ({
  id: r['id'] as string,
  householdId: r['household_id'] as string,
  accountId: r['account_id'] as string,
  cycleYearMonth: r['cycle_year_month'] as string,
  closingDate: (r['closing_date'] as Date).toISOString().slice(0, 10),
  dueDate: (r['due_date'] as Date).toISOString().slice(0, 10),
  totalCents: Number(r['total_cents']),
  paidCents: Number(r['paid_cents']),
  status: r['status'] as Statement['status'],
});

const mapRecurring = (r: Row): RecurringPurchase => opt<RecurringPurchase>(
  {
    id: r['id'] as string,
    householdId: r['household_id'] as string,
    accountId: r['account_id'] as string,
    description: r['description'] as string,
    amountCents: Number(r['amount_cents']),
    frequency: r['frequency'] as RecurringPurchase['frequency'],
    startDate: (r['start_date'] as Date).toISOString().slice(0, 10),
    status: r['status'] as RecurringPurchase['status'],
  },
  {
    endDate: r['end_date'] instanceof Date ? r['end_date'].toISOString().slice(0, 10) : r['end_date'] as string | undefined,
    categoryId: r['category_id'] as string | undefined,
  } as Partial<RecurringPurchase>,
);

// ── CardStore implementation ──────────────────────────────────────

type CreateCardPurchaseInput = Parameters<CardStore['createCardPurchase']>[1];
type CreateCardInstallmentsInput = Parameters<CardStore['createCardInstallments']>[1];
type CreateRecurringPurchaseInput = Parameters<CardStore['createRecurringPurchase']>[1];
type PayStatementInput = Parameters<CardStore['payStatement']>[2];

/**
 * V4.1 Phase 3 (UOW2) — client-bound card cores (no transaction handling).
 * The plain store methods run them in their own transaction; keyed route
 * producers (see cards/keyed-mutations.ts) run them on the open idempotency
 * claim client, so claim + effect + completion commit atomically in ONE
 * transaction. Phase 2 guarantees (statement locks, remaining validation,
 * ledger/projection sync) hold inside the merged tx — same client.
 */
const createCardPurchaseInTx = async (
  client: PoolClient,
  householdId: string,
  input: CreateCardPurchaseInput,
): Promise<Transaction[]> => {
  // M-05: same active/expense-kind category rule as plain entries.
  if (input.categoryId) {
    await resolveExpenseCategoryInTx(client, householdId, input.categoryId);
  }
  if (input.subcategoryId) {
    await resolveSubcategoryInTx(client, householdId, input.subcategoryId, 'expense', input.categoryId);
  }

  // Validate credit card account
  const cardRows = await client.query<Row>(
    `SELECT id, kind, closing_day, due_day, credit_limit_cents
       FROM accounts
      WHERE id = $1 AND household_id = $2 AND status = 'active' AND deleted_at IS NULL`,
    [input.accountId, householdId],
  );
  if (cardRows.rowCount === 0 || cardRows.rows.length === 0) throw domainErrors.notFound('Conta');
  const card = cardRows.rows[0]!;
  if (card['kind'] !== 'credit_card') throw domainErrors.invalid('accountId', 'não é cartão de crédito');
  if (card['closing_day'] == null || card['due_day'] == null) {
    throw domainErrors.invalid('accountId', 'cartão sem fechamento/vencimento configurado');
  }


  const closingDay = Number(card['closing_day']);
  const dueDay = Number(card['due_day']);

  const closing = getClosingDate(input.date, closingDay);
  const cycle = closing.slice(0, 7);
  const due = getDueDate(closing, dueDay);

  // H-04: race-safe find-or-create (single statement per cycle).
  const statementId = await findOrCreateStatementTx(client, householdId, input.accountId, cycle, closing, due);

  // Insert transaction (M-04: subcategory + notes preserved)
  const txId = randomUUID();
  await client.query(
    `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id, notes, statement_id, installments_total, installment_number)
     VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [txId, householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId ?? null, input.subcategoryId ?? null, input.notes ?? null, statementId, input.installmentsTotal ?? null, input.installmentNumber ?? null],
  );
  // M-04: the card_purchases link is mandatory — a failure here rolls
  // back the whole purchase instead of leaving an unlinkable invoice
  // entry (no more silent best-effort catch).
  await client.query(
    `INSERT INTO card_purchases (id, household_id, account_id, statement_id, description, amount_cents, date, category_id, subcategory_id, notes, installments_total, installment_number, transaction_id, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
    [householdId, input.accountId, statementId, input.description, input.amountCents, input.date, input.categoryId ?? null, input.subcategoryId ?? null, input.notes ?? null, input.installmentsTotal ?? null, input.installmentNumber ?? null, txId],
  );

  // Task 2.8: recompute under the statement row lock (no lost updates).
  await recalcStatementLockedTx(client, statementId, householdId);

  const created: Transaction[] = [
    opt<Transaction>(
      { id: txId, householdId, kind: 'expense', description: input.description, amountCents: input.amountCents, date: input.date, accountId: input.accountId },
      {
        categoryId: input.categoryId,
        subcategoryId: input.subcategoryId,
        notes: input.notes,
      } as Partial<Transaction>,
    ),
  ];

  return created;
};

const createCardInstallmentsInTx = async (
  client: PoolClient,
  householdId: string,
  input: CreateCardInstallmentsInput,
): Promise<Transaction[]> => {
  const cardRows = await client.query<Row>(
    `SELECT id, kind, closing_day, due_day FROM accounts WHERE id = $1 AND household_id = $2 AND status = 'active' AND deleted_at IS NULL`,
    [input.accountId, householdId],
  );
  if (cardRows.rowCount === 0 || cardRows.rows.length === 0) throw domainErrors.notFound('Conta');
  const card = cardRows.rows[0]!;
  if (card['kind'] !== 'credit_card') throw domainErrors.invalid('accountId', 'não é cartão de crédito');
  if (card['closing_day'] == null || card['due_day'] == null) throw domainErrors.invalid('accountId', 'cartão sem fechamento/vencimento');

  // M-05: same active/expense-kind category rule as plain entries.
  if (input.categoryId) {
    await resolveExpenseCategoryInTx(client, householdId, input.categoryId);
  }
  if (input.subcategoryId) {
    await resolveSubcategoryInTx(client, householdId, input.subcategoryId, 'expense', input.categoryId);
  }

  const closingDay = Number(card['closing_day']);
  const dueDay = Number(card['due_day']);

  // L-01: single distribution rule (remainder absorbed by the last parcel).
  const amounts = splitInstallmentAmounts(input.totalAmountCents, input.installmentsTotal);
  const txs: Transaction[] = [];
  // V4.1 Task 2.16: clamped billing-month arithmetic (no setUTCMonth
  // overflow: 2026-01-31 + 1 → 2026-02-28, not 2026-03-03).
  const dates = installmentDates(input.purchaseDate, input.installmentsTotal);

  for (let i = 0; i < input.installmentsTotal; i++) {
    const dateStr = dates[i]!;
    const amount = amounts[i]!;

    const closing = getClosingDate(dateStr, closingDay);
    const cycle = closing.slice(0, 7);
    const due = getDueDate(closing, dueDay);

    // H-04: race-safe find-or-create (single statement per cycle).
    const statementId = await findOrCreateStatementTx(client, householdId, input.accountId, cycle, closing, due);

    const txId = randomUUID();
    await client.query(
      `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, subcategory_id, notes, statement_id, installments_total, installment_number)
       VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [txId, householdId, input.description, amount, dateStr, input.accountId, input.categoryId ?? null, input.subcategoryId ?? null, input.notes ?? null, statementId, input.installmentsTotal, i + 1],
    );
    // M-04: mandatory link (fail-closed inside the same transaction).
    await client.query(
      `INSERT INTO card_purchases (id, household_id, account_id, statement_id, description, amount_cents, date, category_id, subcategory_id, notes, installments_total, installment_number, transaction_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())`,
      [householdId, input.accountId, statementId, input.description, amount, dateStr, input.categoryId ?? null, input.subcategoryId ?? null, input.notes ?? null, input.installmentsTotal, i + 1, txId],
    );

    // Task 2.8: recompute under the statement row lock (no lost updates).
    await recalcStatementLockedTx(client, statementId, householdId);

    txs.push(
      opt<Transaction>(
        { id: txId, householdId, kind: 'expense', description: input.description, amountCents: amount, date: dateStr, accountId: input.accountId },
        {
          categoryId: input.categoryId,
          subcategoryId: input.subcategoryId,
          notes: input.notes,
        } as Partial<Transaction>,
      ),
    );
  }
  return txs;
};

const createRecurringPurchaseInTx = async (
  client: PoolClient,
  householdId: string,
  input: CreateRecurringPurchaseInput,
): Promise<RecurringPurchase> => {
  // Task 2.18: same validation as the normal purchase path — card must
  // exist, be active and be a credit card with closing/due configured;
  // category must be an active expense-kind category.
  const cardRows = await client.query<Row>(
    `SELECT id, kind, closing_day, due_day FROM accounts WHERE id = $1 AND household_id = $2 AND status = 'active' AND deleted_at IS NULL`,
    [input.accountId, householdId],
  );
  if (cardRows.rowCount === 0 || cardRows.rows.length === 0) throw domainErrors.notFound('Conta');
  const card = cardRows.rows[0]!;
  if (card['kind'] !== 'credit_card') throw domainErrors.invalid('accountId', 'não é cartão de crédito');
  if (card['closing_day'] == null || card['due_day'] == null) {
    throw domainErrors.invalid('accountId', 'cartão sem fechamento/vencimento configurado');
  }

  if (input.categoryId) {
    await resolveExpenseCategoryInTx(client, householdId, input.categoryId);
  }

  const id = randomUUID();
  await client.query(
    `INSERT INTO recurring_purchases (id, household_id, account_id, description, amount_cents, frequency, start_date, end_date, category_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
    [id, householdId, input.accountId, input.description, input.amountCents, input.frequency, input.startDate, input.endDate ?? null, input.categoryId ?? null],
  );
  return opt<RecurringPurchase>(
    { id, householdId, accountId: input.accountId, description: input.description, amountCents: input.amountCents, frequency: input.frequency, startDate: input.startDate, status: 'active' as const },
    { endDate: input.endDate, categoryId: input.categoryId } as Partial<RecurringPurchase>,
  );
};

const payStatementInTx = async (
  client: PoolClient,
  householdId: string,
  statementId: string,
  input: PayStatementInput,
): Promise<Statement> => {
  // Task 2.9 (SPEC §9.5): BEGIN → lock statement → read paid → compute
  // remaining → validate → create payment → update paid/status → COMMIT.
  // Two concurrent payments serialize on the row lock: the second sees
  // the first's paid amount and is rejected when nothing remains.
  const s = await lockStatementForUpdateTx(client, statementId, householdId);

  const remaining = s.totalCents - s.paidCents;
  if (remaining <= 0) throw domainErrors.invalid('amountCents', 'fatura já está paga');
  if (input.amountCents > remaining) throw domainErrors.invalid('amountCents', 'valor excede o restante da fatura');

  // Lock the payer before the funds check so concurrent payments from
  // the same account cannot jointly overdraw it.
  const fromRows = await client.query<Row>(
    `SELECT id, kind, balance_cents FROM accounts WHERE id = $1 AND household_id = $2 AND status = 'active' AND deleted_at IS NULL FOR UPDATE`,
    [input.fromAccountId, householdId],
  );
  if (fromRows.rowCount === 0) throw domainErrors.notFound('Conta de origem');
  if (fromRows.rows[0]!['kind'] === 'credit_card') throw domainErrors.invalid('fromAccountId', 'não pode pagar fatura com cartão de crédito');

  // D1: pre-debit validation under lock — never clamp, reject instead.
  const balance = Number(fromRows.rows[0]!['balance_cents']);
  if (balance < input.amountCents) throw domainErrors.invalid('amountCents', 'saldo insuficiente na conta de origem');
  await client.query(
    `UPDATE accounts SET balance_cents = balance_cents - $1, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
    [input.amountCents, input.fromAccountId, householdId],
  );

  // D3-pattern: the payment creates its own expense transaction
  // (previously missing — the debit had no ledger record).
  const today = todayISO();
  await client.query(
    `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id)
     VALUES ($1, $2, 'expense', $3, $4, $5, $6)`,
    [randomUUID(), householdId, `Pagamento fatura ${s.cycleYearMonth}`, input.amountCents, today, input.fromAccountId],
  );

  // Apply to statement (locked — no lost update on paid_cents).
  await client.query(
    `UPDATE statements SET paid_cents = paid_cents + $1, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
    [input.amountCents, statementId, householdId],
  );

  // Recalculate status
  const updated = await client.query<Row>(`SELECT * FROM statements WHERE id = $1 AND household_id = $2`, [statementId, householdId]);
  const updatedStmt = mapStatement(updated.rows[0]!);
  const newStatus = computeStatus(updatedStmt, today);
  if (newStatus !== updatedStmt.status) {
    await client.query(
      `UPDATE statements SET status = $1, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
      [newStatus, statementId, householdId],
    );
  }

  // Add to card balance (paid amount goes toward the card's "available credit")
  await client.query(
    `UPDATE accounts SET balance_cents = balance_cents + $1, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
    [input.amountCents, s.accountId, householdId],
  );

  return { ...updatedStmt, status: newStatus };
};

const cancelPurchaseInTx = async (
  client: PoolClient,
  householdId: string,
  purchaseId: string,
): Promise<void> => {
  // Idempotência: se já deletado, retorna
  const already = await client.query<Row>(
    `SELECT id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NOT NULL`,
    [purchaseId, householdId],
  );
  if ((already.rowCount ?? 0) > 0) return;

  const txExists = await client.query<Row>(
    `SELECT id, statement_id, amount_cents, date FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
    [purchaseId, householdId],
  );
  if ((txExists.rowCount ?? 0) === 0) {
    throw domainErrors.notFound('Compra');
  }
  const stmtId = txExists.rows[0]!['statement_id'] as string | null;
  if (!stmtId) throw domainErrors.notFound('Compra');
  // Task 2.8: status gate on the locked row (no TOCTOU between the
  // open-check and the total recompute).
  const locked = await lockStatementForUpdateTx(client, stmtId, householdId);
  if (locked.status !== 'open') throw domainErrors.conflict('Fatura não está aberta para cancelamento.');

  // V4.1 REVIEWFIX F5: explicit transaction-row lock AFTER the
  // statement lock — same STATEMENT → TRANSACTION → projection order
  // as updatePurchase, so the two paths serialize instead of
  // deadlocking. Re-checks liveness under the lock.
  const lockedTx = await client.query<Row>(
    `SELECT id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`,
    [purchaseId, householdId],
  );
  if ((lockedTx.rowCount ?? 0) === 0) throw domainErrors.notFound('Compra');

  await client.query(`UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2`, [purchaseId, householdId]);
  // FINAL REVIEW: projection soft-delete must not fail silently — a swallowed
  // error here would confirm the ledger tombstone while leaving an active
  // card_purchases row. Let the failure roll the whole tx back.
  await client.query(`UPDATE card_purchases SET deleted_at = NOW(), updated_at = NOW() WHERE transaction_id = $1 AND household_id = $2 AND deleted_at IS NULL`, [purchaseId, householdId]);

  // Task 2.8: recompute under the statement row lock.
  await recalcStatementLockedTx(client, stmtId, householdId);
};

export const createPostgresCardStore = (pool: Pool): CardStore => {
  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  const store: CardStore = {
    async listCreditCardAccounts(householdId) {
      const rows = await query<Row>(
        `SELECT id, household_id, name, kind, balance_cents, status,
                credit_limit_cents, closing_day, due_day
           FROM accounts
          WHERE household_id = $1
            AND kind = 'credit_card'
            AND status = 'active'
            AND deleted_at IS NULL`,
        [householdId],
      );
      return rows.map(mapAccount);
    },

    async listStatements(householdId, accountId, opts) {
      const params: unknown[] = [householdId];
      const conditions: string[] = ['s.household_id = $1'];
      if (accountId) { params.push(accountId); conditions.push(`s.account_id = $${params.length}`); }
      if (opts?.status) { params.push(opts.status); conditions.push(`s.status = $${params.length}`); }
      const limit = opts?.limit ?? 12;
      params.push(limit);

      const rows = await query<Row>(
        `SELECT s.id, s.household_id, s.account_id, s.cycle_year_month,
                s.closing_date, s.due_date, s.total_cents, s.paid_cents, s.status
           FROM statements s
          WHERE ${conditions.join(' AND ')}
          ORDER BY s.closing_date DESC
          LIMIT $${params.length}`,
        params,
      );
      return rows.map(mapStatement);
    },

    async getStatementDetail(householdId, statementId) {
      const stmtRows = await query<Row>(
        `SELECT id, household_id, account_id, cycle_year_month,
                closing_date, due_date, total_cents, paid_cents, status
           FROM statements
          WHERE id = $1 AND household_id = $2`,
        [statementId, householdId],
      );
      if (stmtRows.length === 0) return null;
      const s = mapStatement(stmtRows[0]!);

      // Primary query: purchases linked by statement_id, scoped to category household
      const includeCatId = `, c.id AS category_id, c.name AS category_name`;

      let purchaseRows = await query<Row>(
        `SELECT t.id, t.description, t.amount_cents, t.date::text AS date,
                t.installments_total, t.installment_number${includeCatId}
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id AND c.household_id = $2
          WHERE t.statement_id = $1
            AND t.household_id = $2
            AND t.deleted_at IS NULL
          ORDER BY t.date ASC, t.created_at ASC`,
        [statementId, householdId],
      );

      // Fallback: when statement_id query is empty, find purchases by
      // account + cycle period (handles data where statement_id was not set).
      if (purchaseRows.length === 0) {
        const closing = new Date(s.closingDate + 'T00:00:00.000Z');
        const prevClosing = new Date(closing);
        prevClosing.setUTCMonth(prevClosing.getUTCMonth() - 1);
        const periodStart = prevClosing.toISOString().slice(0, 10);

        purchaseRows = await query<Row>(
          `SELECT t.id, t.description, t.amount_cents, t.date::text AS date,
                  t.installments_total, t.installment_number${includeCatId}
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id AND c.household_id = $4
            WHERE t.account_id = $1
              AND t.household_id = $4
              AND t.date > $2
              AND t.date <= $3
              AND t.deleted_at IS NULL
            ORDER BY t.date ASC, t.created_at ASC`,
          [s.accountId, periodStart, s.closingDate, householdId],
        );
      }

      const purchases: StatementPurchase[] = purchaseRows.map(r => {
        const instNum = r['installment_number'];
        const instTotal = r['installments_total'];
        const dateStr = r['date'] instanceof Date ? r['date'].toISOString().slice(0, 10) : String(r['date']).slice(0, 10);
        return opt<StatementPurchase>(
          {
            id: r['id'] as string,
            description: r['description'] as string,
            amountCents: Number(r['amount_cents']),
            date: dateStr,
            isRecurring: false,
          },
          {
            categoryId: (r['category_id'] as string) ?? undefined,
            categoryName: (r['category_name'] as string) ?? undefined,
            ...(instNum != null ? { installmentNumber: Number(instNum) } : {}),
            ...(instTotal != null ? { installmentsTotal: Number(instTotal) } : {}),
          } as Partial<StatementPurchase>,
        );
      });

      return { ...s, purchases };
    },

    async createCardPurchase(householdId, input) {
      return withTransaction(pool, (client) => createCardPurchaseInTx(client, householdId, input));
    },

    async createCardInstallments(householdId, input) {
      return withTransaction(pool, (client) => createCardInstallmentsInTx(client, householdId, input));
    },
    async listRecurringPurchases(householdId, opts) {
      const params: unknown[] = [householdId];
      const conditions: string[] = ['household_id = $1'];
      if (opts?.accountId) {
        params.push(opts.accountId);
        conditions.push(`account_id = $${params.length}`);
      }
      if (opts?.status) {
        params.push(opts.status);
        conditions.push(`status = $${params.length}`);
      }
      const rows = await query<Row>(
        `SELECT id, household_id, account_id, description, amount_cents, frequency, start_date, end_date, category_id, status
           FROM recurring_purchases
          WHERE ${conditions.join(' AND ')}
          ORDER BY start_date DESC, created_at DESC`,
        params,
      );
      return rows.map(mapRecurring);
    },

    async createRecurringPurchase(householdId, input) {
      return withTransaction(pool, (client) => createRecurringPurchaseInTx(client, householdId, input));
    },

    async payStatement(householdId, statementId, input) {
      return withTransaction(pool, (client) => payStatementInTx(client, householdId, statementId, input));
    },

    async updatePurchase(householdId, purchaseId, input) {
      // Task 2.7: the detail is read AFTER commit — getStatementDetail
      // queries through the pool, which cannot see this transaction's
      // uncommitted writes.
      const stmtId = await withTransaction(pool, async (client): Promise<string> => {
        if (input.categoryId) {
          // FINAL REVIEW: PATCH must apply the same active/expense rule as
          // creation (M-05) — not just existence.
          await resolveExpenseCategoryInTx(client, householdId, input.categoryId);
        }

        // V4.1 REVIEWFIX F5 [major]: global lock order STATEMENT →
        // TRANSACTION → projection. The ledger row is peeked WITHOUT a lock
        // to discover the statement; the statement row is locked first, then
        // the transaction row. (cancelPurchase already locks in this order —
        // the previous TX-first order here deadlocked against it.)
        const peek = await client.query<Row>(
          `SELECT id, statement_id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
          [purchaseId, householdId],
        );
        if (peek.rowCount === 0 || peek.rows.length === 0) throw domainErrors.notFound('Compra');
        const peekStmtId = peek.rows[0]!['statement_id'] as string | null;
        if (!peekStmtId) throw domainErrors.notFound('Compra');

        // V4.1 REVIEWFIX F7 [major]: like cancelPurchase, the PATCH path
        // only edits purchases of an open statement (checked under the
        // statement lock — no TOCTOU).
        const locked = await lockStatementForUpdateTx(client, peekStmtId, householdId);
        if (locked.status !== 'open') throw domainErrors.conflict('Fatura não está aberta para edição.');

        const txExists = await client.query<Row>(
          `SELECT id, statement_id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`,
          [purchaseId, householdId],
        );
        if (txExists.rowCount === 0 || txExists.rows.length === 0) throw domainErrors.notFound('Compra');

        // SPEC §9.3: placeholders are derived from the key prefix — $1/$2
        // are the row keys, so the first patched column binds at $3.
        // (The previous `let idx = 1` base bound the first column to the
        // household id: text fields silently took the household UUID and
        // amount_cents raised a bigint-vs-uuid error.)
        const sets: string[] = [];
        const params: unknown[] = [];
        let idx = 2;
        if (input.description !== undefined) { sets.push(`description = $${++idx}`); params.push(input.description); }
        if (input.amountCents !== undefined) { sets.push(`amount_cents = $${++idx}`); params.push(input.amountCents); }
        if (input.date !== undefined) { sets.push(`date = $${++idx}`); params.push(input.date); }
        if (input.categoryId !== undefined) { sets.push(`category_id = $${++idx}`); params.push(input.categoryId); }
        if (sets.length === 0) throw domainErrors.invalid('body', 'nenhum campo para atualizar');

        params.unshift(purchaseId, householdId);
        await client.query(
          `UPDATE transactions SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 AND household_id = $2`,
          params,
        );

        // D2: ledger = transactions → the card_purchases projection row
        // linked by transaction_id carries the same fields in the same tx.
        const projSets: string[] = [];
        const projParams: unknown[] = [];
        let pIdx = 2;
        if (input.description !== undefined) { projSets.push(`description = $${++pIdx}`); projParams.push(input.description); }
        if (input.amountCents !== undefined) { projSets.push(`amount_cents = $${++pIdx}`); projParams.push(input.amountCents); }
        if (input.date !== undefined) { projSets.push(`date = $${++pIdx}`); projParams.push(input.date); }
        if (input.categoryId !== undefined) { projSets.push(`category_id = $${++pIdx}`); projParams.push(input.categoryId); }
        projParams.unshift(purchaseId, householdId);
        await client.query(
          `UPDATE card_purchases SET ${projSets.join(', ')}, updated_at = NOW() WHERE transaction_id = $1 AND household_id = $2 AND deleted_at IS NULL`,
          projParams,
        );

        const stmtId = txExists.rows[0]!['statement_id'] as string | null;

        if (!stmtId || stmtId !== peekStmtId) throw domainErrors.notFound('Compra');
        // Task 2.8: recompute under the statement row lock (already held —
        // re-locking the same row in the same tx is a no-op).
        await recalcStatementLockedTx(client, stmtId, householdId);
        return stmtId;
      });
      return (await this.getStatementDetail(householdId, stmtId))!;
    },

    async cancelPurchase(householdId, purchaseId) {
      return withTransaction(pool, (client) => cancelPurchaseInTx(client, householdId, purchaseId));
    },

    async createCard(householdId, input) {
      const res = await query<Row>(
        `INSERT INTO accounts (id, household_id, name, kind, balance_cents, status, credit_limit_cents, closing_day, due_day)
         VALUES (gen_random_uuid(), $1, $2, 'credit_card', 0, 'active', $3, $4, $5)
         RETURNING id, household_id, name, kind, balance_cents, status, credit_limit_cents, closing_day, due_day`,
        [householdId, input.name, input.creditLimitCents, input.closingDay, input.dueDay],
      );
      return mapAccount(res[0]!);
    },

    async updateCard(householdId, id, input) {
      return withTransaction(pool, async (client) => {
        // SPEC §9.3: $1/$2 are the row keys — first column binds at $3.
        const sets: string[] = [];
        const params: unknown[] = [];
        let idx = 2;
        if (input.name !== undefined) { sets.push(`name = $${++idx}`); params.push(input.name); }
        if (input.creditLimitCents !== undefined) { sets.push(`credit_limit_cents = $${++idx}`); params.push(input.creditLimitCents); }
        if (input.closingDay !== undefined) { sets.push(`closing_day = $${++idx}`); params.push(input.closingDay); }
        if (input.dueDay !== undefined) { sets.push(`due_day = $${++idx}`); params.push(input.dueDay); }
        if (sets.length === 0) throw domainErrors.invalid('body', 'nenhum campo para atualizar');
        params.unshift(id, householdId);
        const res = await client.query<Row>(
          `UPDATE accounts SET ${sets.join(', ')}, updated_at = NOW()
            WHERE id = $1 AND household_id = $2 AND kind = 'credit_card' AND status = 'active' AND deleted_at IS NULL
            RETURNING id, household_id, name, kind, balance_cents, status, credit_limit_cents, closing_day, due_day`,
          params,
        );
        if (res.rowCount === 0 || res.rows.length === 0) throw domainErrors.notFound('Cartão');
        return mapAccount(res.rows[0]!);
      });
    },
  };
  // V4.1 Phase 3 (UOW2): expose the client-bound cores as non-contractual
  // extensions (see CardStoreTxExtensions in cards/keyed-mutations.ts).
  // The declared factory return type stays CardStore.
  return Object.assign(store, {
    createCardPurchaseInTx,
    createCardInstallmentsInTx,
    createRecurringPurchaseInTx,
    payStatementInTx,
    cancelPurchaseInTx,
  });
};
