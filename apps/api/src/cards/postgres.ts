/**
 * Postgres implementation of CardStore.
 *
 * Uses the V004 schema (statements table, credit_limit_cents /
 * closing_day / due_day on accounts, installments_total /
 * installment_number / statement_id on transactions).
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

/** Helper: spread conditional optional properties to satisfy exactOptionalPropertyTypes. */
function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

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

// ── CardStore implementation ──────────────────────────────────────

export const createPostgresCardStore = (pool: Pool): CardStore => {
  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  return {
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

      const purchaseRows = await query<Row>(
        `SELECT t.id, t.description, t.amount_cents, t.date::text AS date,
                t.installments_total, t.installment_number,
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
            date: (r['date'] as Date).toISOString().slice(0, 10),
            isRecurring: false,
          },
          {
            categoryName: (r['category_name'] as string) ?? undefined,
            ...(instNum != null ? { installmentNumber: Number(instNum) } : {}),
            ...(instTotal != null ? { installmentsTotal: Number(instTotal) } : {}),
          } as Partial<StatementPurchase>,
        );
      });

      return { ...s, purchases };
    },

    async createCardPurchase(householdId, input) {
      // Validate credit card account
      const cardRows = await query<Row>(
        `SELECT id, kind, closing_day, due_day, credit_limit_cents
           FROM accounts
          WHERE id = $1 AND household_id = $2 AND status = 'active' AND deleted_at IS NULL`,
        [input.accountId, householdId],
      );
      if (cardRows.length === 0) throw domainErrors.notFound('Conta');
      const card = cardRows[0]!;
      if (card['kind'] !== 'credit_card') throw domainErrors.invalid('accountId', 'não é cartão de crédito');
      if (card['closing_day'] == null || card['due_day'] == null) {
        throw domainErrors.invalid('accountId', 'cartão sem fechamento/vencimento configurado');
      }
      const closingDay = Number(card['closing_day']);
      const dueDay = Number(card['due_day']);

      const closing = getClosingDate(input.date, closingDay);
      const cycle = closing.slice(0, 7);
      const due = getDueDate(closing, dueDay);

      // Find or create statement
      let stmtRows = await query<Row>(
        `SELECT id FROM statements WHERE account_id = $1 AND cycle_year_month = $2`,
        [input.accountId, cycle],
      );

      let statementId: string;
      if (stmtRows.length > 0) {
        statementId = stmtRows[0]!['id'] as string;
      } else {
        statementId = randomUUID();
        await query(
          `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, paid_cents, status)
           VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'open')`,
          [statementId, householdId, input.accountId, cycle, closing, due],
        );
      }

      // Insert transaction
      const txId = randomUUID();
      await query(
        `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, statement_id, installments_total, installment_number)
         VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, $10)`,
        [txId, householdId, input.description, input.amountCents, input.date, input.accountId, input.categoryId ?? null, statementId, input.installmentsTotal ?? null, input.installmentNumber ?? null],
      );

      // Recalculate statement total
      const totalResult = await query<Row>(
        `SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions WHERE statement_id = $1 AND deleted_at IS NULL`,
        [statementId],
      );
      const total = Number(totalResult[0]!['total']);
      const stmtForStatus = mapStatement((await query<Row>(`SELECT * FROM statements WHERE id = $1`, [statementId]))[0]!);
      const newStatus = computeStatus({ ...stmtForStatus, totalCents: total }, todayISO());
      await query(`UPDATE statements SET total_cents = $1, status = $2, updated_at = NOW() WHERE id = $3`, [total, newStatus, statementId]);

      const created: Transaction[] = [
        opt<Transaction>(
          { id: txId, householdId, kind: 'expense', description: input.description, amountCents: input.amountCents, date: input.date, accountId: input.accountId },
          { categoryId: input.categoryId } as Partial<Transaction>,
        ),
      ];

      return created;
    },

    async createCardInstallments(householdId, input) {
      const cardRows = await query<Row>(
        `SELECT id, kind, closing_day, due_day FROM accounts WHERE id = $1 AND household_id = $2 AND status = 'active' AND deleted_at IS NULL`,
        [input.accountId, householdId],
      );
      if (cardRows.length === 0) throw domainErrors.notFound('Conta');
      const card = cardRows[0]!;
      if (card['kind'] !== 'credit_card') throw domainErrors.invalid('accountId', 'não é cartão de crédito');
      if (card['closing_day'] == null || card['due_day'] == null) throw domainErrors.invalid('accountId', 'cartão sem fechamento/vencimento');
      const closingDay = Number(card['closing_day']);
      const dueDay = Number(card['due_day']);

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

        let stmtRows = await query<Row>(`SELECT id FROM statements WHERE account_id = $1 AND cycle_year_month = $2`, [input.accountId, cycle]);
        let statementId: string;
        if (stmtRows.length > 0) {
          statementId = stmtRows[0]!['id'] as string;
        } else {
          statementId = randomUUID();
          await query(
            `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, paid_cents, status)
             VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'open')`,
            [statementId, householdId, input.accountId, cycle, closing, due],
          );
        }

        const txId = randomUUID();
        await query(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id, statement_id, installments_total, installment_number)
           VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $9, $10)`,
          [txId, householdId, input.description, amount, dateStr, input.accountId, input.categoryId ?? null, statementId, input.installmentsTotal, i + 1],
        );

        const totalResult = await query<Row>(`SELECT COALESCE(SUM(amount_cents), 0) AS total FROM transactions WHERE statement_id = $1 AND deleted_at IS NULL`, [statementId]);
        const total = Number(totalResult[0]!['total']);
        const stmtForStatus = mapStatement((await query<Row>(`SELECT * FROM statements WHERE id = $1`, [statementId]))[0]!);
        const newStatus = computeStatus({ ...stmtForStatus, totalCents: total }, todayISO());
        await query(`UPDATE statements SET total_cents = $1, status = $2, updated_at = NOW() WHERE id = $3`, [total, newStatus, statementId]);

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
      const id = randomUUID();
      await query(
        `INSERT INTO recurring_purchases (id, household_id, account_id, description, amount_cents, frequency, start_date, end_date, category_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')`,
        [id, householdId, input.accountId, input.description, input.amountCents, input.frequency, input.startDate, input.endDate ?? null, input.categoryId ?? null],
      );
      return opt<RecurringPurchase>(
        { id, householdId, accountId: input.accountId, description: input.description, amountCents: input.amountCents, frequency: input.frequency, startDate: input.startDate, status: 'active' as const },
        { endDate: input.endDate, categoryId: input.categoryId } as Partial<RecurringPurchase>,
      );
    },

    async payStatement(householdId, statementId, input) {
      // Validate statement
      const stmtRows = await query<Row>(
        `SELECT id, household_id, account_id, total_cents, paid_cents, status, closing_date, due_date, cycle_year_month
           FROM statements WHERE id = $1 AND household_id = $2`,
        [statementId, householdId],
      );
      if (stmtRows.length === 0) throw domainErrors.notFound('Fatura');

      // Validate source account
      const fromRows = await query<Row>(
        `SELECT id, kind, balance_cents FROM accounts WHERE id = $1 AND household_id = $2 AND status = 'active' AND deleted_at IS NULL`,
        [input.fromAccountId, householdId],
      );
      if (fromRows.length === 0) throw domainErrors.notFound('Conta de origem');
      if (fromRows[0]!['kind'] === 'credit_card') throw domainErrors.invalid('fromAccountId', 'não pode pagar fatura com cartão de crédito');

      // Deduct from source (with balance check)
      const balance = Number(fromRows[0]!['balance_cents']);
      if (balance < input.amountCents) throw domainErrors.invalid('amountCents', 'saldo insuficiente na conta de origem');
      await query(`UPDATE accounts SET balance_cents = balance_cents - $1, updated_at = NOW() WHERE id = $2`, [input.amountCents, input.fromAccountId]);

      // Apply to statement
      await query(`UPDATE statements SET paid_cents = paid_cents + $1, updated_at = NOW() WHERE id = $2`, [input.amountCents, statementId]);

      // Recalculate status
      const updated = await query<Row>(`SELECT * FROM statements WHERE id = $1`, [statementId]);
      const s = mapStatement(updated[0]!);
      const newStatus = computeStatus(s, todayISO());
      if (newStatus !== s.status) {
        await query(`UPDATE statements SET status = $1, updated_at = NOW() WHERE id = $2`, [newStatus, statementId]);
      }

      // Add to card balance (paid amount goes toward the card's "available credit")
      await query(`UPDATE accounts SET balance_cents = balance_cents + $1, updated_at = NOW() WHERE id = $2`, [input.amountCents, s.accountId]);

      return { ...s, status: newStatus };
    },
  };
};
