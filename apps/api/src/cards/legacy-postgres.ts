/**
 * Legacy Postgres implementation of CardStore.
 *
 * Maps the canonical CardStore contract onto the existing pi_financeiro
 * schema (Agent Pi migrations). Activated by DB_SCHEMA=legacy.
 *
 * Why this exists: the canonical card store (cards/postgres.ts) queries
 * accounts with `kind`/`balance_cents`/`status` columns and inserts into
 * transactions.account_id — none of which exist in the legacy schema.
 * Wiring the canonical store in legacy mode makes every /cards/* endpoint
 * 500 on `column "kind" does not exist`.
 *
 * Key differences from the canonical store:
 * - accounts: credit cards flagged by `is_credit_card` boolean (no `kind`),
 *   `active` boolean (no `status`), balance computed from
 *   `initial_balance_cents` + transactions (no stored `balance_cents`).
 * - transactions: card purchases use `from_account_id` (no `account_id`)
 *   and `is_credit_card_purchase = true`.
 * - recurring_purchases: `next_due_date` is NOT NULL → seeded to start_date.
 * - payStatement debits the payer account via an expense transaction and
 *   does NOT mutate the card balance (mirrors the Agent Pi pay_statement
 *   tool; the card balance is computed from its purchase transactions).
 *
 * Statement and recurring read columns match the canonical schema, so the
 * statement read queries are the same shape as cards/postgres.ts.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Account, Transaction, Statement, StatementDetail, StatementPurchase, RecurringPurchase } from '../types/domain.js';
import type { CardStore } from './store.js';
import { domainErrors } from '../writes/errors.js';

type Row = Record<string, unknown>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Statement date/status math ───────────────────────────────────
// Identical to cards/postgres.ts; duplicated locally so the legacy
// adapter does not couple to the canonical store.

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

/** Spread conditional optional properties to satisfy exactOptionalPropertyTypes. */
function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as Record<string, unknown>)[k] = v;
  }
  return result;
}

// ── Row mappers ──────────────────────────────────────────────────

const mapAccount = (r: Row): Account => opt<Account>(
  {
    id: r['id'] as string,
    householdId: r['household_id'] as string,
    name: r['name'] as string,
    kind: 'credit_card',
    balanceCents: Number(r['balance_cents'] ?? 0),
    status: r['active'] ? 'active' : 'inactive',
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

// ── CardStore implementation ──────────────────────────────────────

export const createLegacyPostgresCardStore = (pool: Pool): CardStore => {
  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  /** Find-or-create the statement for a card cycle, returning its id. */
  const findOrCreateStatement = async (
    householdId: string,
    accountId: string,
    cycle: string,
    closing: string,
    due: string,
  ): Promise<string> => {
    const existing = await query<Row>(
      `SELECT id FROM statements WHERE account_id = $1 AND cycle_year_month = $2`,
      [accountId, cycle],
    );
    if (existing.length > 0) return existing[0]!['id'] as string;
    const id = randomUUID();
    await query(
      `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, paid_cents, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'open', NOW(), NOW())`,
      [id, householdId, accountId, cycle, closing, due],
    );
    return id;
  };

  /** Recalculate a statement's total from its purchases and refresh status. */
  const recalcStatement = async (statementId: string): Promise<void> => {
    const totalResult = await query<Row>(
      `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions WHERE statement_id = $1 AND deleted_at IS NULL`,
      [statementId],
    );
    const total = Number(totalResult[0]!['total']);
    const stmt = mapStatement((await query<Row>(`SELECT * FROM statements WHERE id = $1`, [statementId]))[0]!);
    const newStatus = computeStatus({ ...stmt, totalCents: total }, todayISO());
    await query(`UPDATE statements SET total_cents = $1, status = $2, updated_at = NOW() WHERE id = $3`, [total, newStatus, statementId]);
  };

  /** Load and validate a credit card account for writes. */
  const requireCard = async (householdId: string, accountId: string): Promise<{ closingDay: number; dueDay: number }> => {
    const rows = await query<Row>(
      `SELECT id, is_credit_card, closing_day, due_day FROM accounts WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
      [accountId, householdId],
    );
    if (rows.length === 0) throw domainErrors.notFound('Conta');
    const card = rows[0]!;
    if (card['is_credit_card'] !== true) throw domainErrors.invalid('accountId', 'não é cartão de crédito');
    if (card['closing_day'] == null || card['due_day'] == null) {
      throw domainErrors.invalid('accountId', 'cartão sem fechamento/vencimento configurado');
    }
    return { closingDay: Number(card['closing_day']), dueDay: Number(card['due_day']) };
  };

  return {
    async listCreditCardAccounts(householdId) {
      const rows = await query<Row>(
        `SELECT a.id, a.household_id, a.name, a.active,
                a.credit_limit_cents, a.closing_day, a.due_day,
                COALESCE(a.initial_balance_cents, 0)
                + COALESCE(totals.income, 0)
                - COALESCE(totals.expense, 0)
                - COALESCE(totals.transfer_out, 0)
                + COALESCE(totals.transfer_in, 0)
                AS balance_cents
           FROM accounts a
           LEFT JOIN LATERAL (
             SELECT
               COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'income' AND t.to_account_id = a.id), 0) AS income,
               COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'expense' AND t.from_account_id = a.id), 0) AS expense,
               COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'transfer' AND t.from_account_id = a.id), 0) AS transfer_out,
               COALESCE(SUM(t.amount_cents) FILTER (WHERE t.kind = 'transfer' AND t.to_account_id = a.id), 0) AS transfer_in
             FROM transactions t
             WHERE t.deleted_at IS NULL
           ) totals ON true
          WHERE a.household_id = $1
            AND a.is_credit_card = true
            AND a.active = true
            AND a.deleted_at IS NULL
          ORDER BY a.name ASC`,
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

      const purchaseRows = await query<Row>(
        `SELECT t.id, t.description, t.amount_cents, t.date::text AS date,
                t.installments_total, t.installment_number, t.is_recurring,
                c.name AS category_name
           FROM transactions t
           LEFT JOIN categories c ON t.category_id = c.id
          WHERE t.statement_id = $1
            AND t.deleted_at IS NULL
          ORDER BY t.date ASC, t.created_at ASC`,
        [statementId],
      );

      const purchases: StatementPurchase[] = purchaseRows.map(r => {
        const instNum = r['installment_number'];
        const instTotal = r['installments_total'];
        return opt<StatementPurchase>(
          {
            id: r['id'] as string,
            description: r['description'] as string,
            amountCents: Number(r['amount_cents']),
            date: r['date'] as string,
            isRecurring: r['is_recurring'] === true,
          },
          {
            categoryName: (r['category_name'] as string) ?? undefined,
            ...(instNum != null ? { installmentNumber: Number(instNum) } : {}),
            ...(instTotal != null ? { installmentsTotal: Number(instTotal) } : {}),
          } as Partial<StatementPurchase>,
        );
      });

      const detail: StatementDetail = { ...s, purchases };
      return detail;
    },

    async createCardPurchase(householdId, input) {
      const { closingDay, dueDay } = await requireCard(householdId, input.accountId);

      const closing = getClosingDate(input.date, closingDay);
      const cycle = closing.slice(0, 7);
      const due = getDueDate(closing, dueDay);
      const statementId = await findOrCreateStatement(householdId, input.accountId, cycle, closing, due);

      const txId = randomUUID();
      await query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, category_id, statement_id, installments_total, installment_number, is_credit_card_purchase)
         VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, $10, true)`,
        [txId, householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId ?? null, statementId, input.installmentsTotal ?? null, input.installmentNumber ?? null],
      );

      await recalcStatement(statementId);

      return [
        opt<Transaction>(
          { id: txId, householdId, kind: 'expense', description: input.description, amountCents: input.amountCents, date: input.date, accountId: input.accountId },
          { categoryId: input.categoryId } as Partial<Transaction>,
        ),
      ];
    },

    async createCardInstallments(householdId, input) {
      const { closingDay, dueDay } = await requireCard(householdId, input.accountId);

      const baseValue = Math.floor(input.totalAmountCents / input.installmentsTotal);
      const remainder = input.totalAmountCents - baseValue * input.installmentsTotal;
      const txs: Transaction[] = [];
      const date = new Date(input.purchaseDate + 'T00:00:00.000Z');

      for (let i = 0; i < input.installmentsTotal; i++) {
        const instDate = new Date(date);
        instDate.setUTCMonth(instDate.getUTCMonth() + i);
        const dateStr = instDate.toISOString().slice(0, 10);
        const amount = i === input.installmentsTotal - 1 ? baseValue + remainder : baseValue;

        const closing = getClosingDate(dateStr, closingDay);
        const cycle = closing.slice(0, 7);
        const due = getDueDate(closing, dueDay);
        const statementId = await findOrCreateStatement(householdId, input.accountId, cycle, closing, due);

        const txId = randomUUID();
        await query(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, category_id, statement_id, installments_total, installment_number, is_credit_card_purchase)
           VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, $10, true)`,
          [txId, householdId, input.description, amount, dateStr, input.accountId, input.categoryId ?? null, statementId, input.installmentsTotal, i + 1],
        );

        await recalcStatement(statementId);

        txs.push(
          opt<Transaction>(
            { id: txId, householdId, kind: 'expense', description: input.description, amountCents: amount, date: dateStr, accountId: input.accountId },
            { categoryId: input.categoryId } as Partial<Transaction>,
          ),
        );
      }
      return txs;
    },

    async createRecurringPurchase(householdId, input) {
      await requireCard(householdId, input.accountId);
      const id = randomUUID();
      await query(
        `INSERT INTO recurring_purchases (id, household_id, account_id, description, amount_cents, frequency, start_date, end_date, category_id, status, next_due_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $7, NOW(), NOW())`,
        [id, householdId, input.accountId, input.description, input.amountCents, input.frequency, input.startDate, input.endDate ?? null, input.categoryId ?? null],
      );
      return opt<RecurringPurchase>(
        { id, householdId, accountId: input.accountId, description: input.description, amountCents: input.amountCents, frequency: input.frequency, startDate: input.startDate, status: 'active' as const },
        { endDate: input.endDate, categoryId: input.categoryId } as Partial<RecurringPurchase>,
      );
    },

    async payStatement(householdId, statementId, input) {
      const stmtRows = await query<Row>(
        `SELECT id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, paid_cents, status
           FROM statements WHERE id = $1 AND household_id = $2`,
        [statementId, householdId],
      );
      if (stmtRows.length === 0) throw domainErrors.notFound('Fatura');
      const stmt = mapStatement(stmtRows[0]!);

      const remaining = stmt.totalCents - stmt.paidCents;
      if (remaining <= 0) throw domainErrors.invalid('amountCents', 'fatura já está paga');
      if (input.amountCents > remaining) throw domainErrors.invalid('amountCents', 'valor excede o saldo da fatura');

      const fromRows = await query<Row>(
        `SELECT id, is_credit_card FROM accounts WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
        [input.fromAccountId, householdId],
      );
      if (fromRows.length === 0) throw domainErrors.notFound('Conta de origem');
      if (fromRows[0]!['is_credit_card'] === true) throw domainErrors.invalid('fromAccountId', 'não pode pagar fatura com cartão de crédito');

      // Apply payment to statement.
      const newPaid = stmt.paidCents + input.amountCents;
      await query(`UPDATE statements SET paid_cents = $1, updated_at = NOW() WHERE id = $2`, [newPaid, statementId]);

      // Debit the payer account via an expense transaction (legacy balances
      // are computed from transactions; the card balance is not mutated).
      const today = todayISO();
      await query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, is_credit_card_purchase)
         VALUES ($1, $2, 'expense', $3, $4, $5, $6, false)`,
        [randomUUID(), householdId, `Pagamento fatura ${stmt.cycleYearMonth}`, input.amountCents, today, input.fromAccountId],
      );

      const newStatus = computeStatus({ ...stmt, paidCents: newPaid }, today);
      if (newStatus !== stmt.status) {
        await query(`UPDATE statements SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, statementId]);
      }

      return { ...stmt, paidCents: newPaid, status: newStatus };
    },
  };
};
