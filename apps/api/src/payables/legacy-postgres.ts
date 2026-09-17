/**
 * Legacy Postgres implementation of PayableStore.
 *
 * Maps the canonical PayableStore contract onto the existing pi_financeiro
 * schema (Agent Pi migrations). Activated by DB_SCHEMA=legacy.
 *
 * Key differences from the canonical store:
 * - accounts_payable: no `paid_amount_cents` column.
 * - transactions: payment transactions insert into `from_account_id`
 *   (not `account_id`).
 * - accounts: no `kind`/`balance_cents`/`status` columns; balance computed.
 *
 * Reuses the canonical Postgres store for methods whose SQL is schema-compatible
 * (listPayables, createPayable, cancelPayable, template CRUD/automation,
 * reminders, notifications).
 */

import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Payable, PayableStore } from './store.js';
import { createPostgresPayableStore, insertPayableRow } from './postgres.js';
import { domainErrors, DomainError } from '../writes/errors.js';
import { assertCategoryKind } from '../categories/resolve.js';
import { withTransaction } from '../db/pool.js';

type Row = Record<string, unknown>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function getNextDue(dueDate: string, frequency: 'monthly' | 'quarterly' | 'yearly'): string | undefined {
  const d = new Date(dueDate + 'T00:00:00.000Z');
  let m = d.getUTCMonth();
  let y = d.getUTCFullYear();
  const day = d.getUTCDate();
  if (frequency === 'monthly') m += 1;
  else if (frequency === 'quarterly') m += 3;
  else if (frequency === 'yearly') y += 1;
  if (m > 11) { y += Math.floor(m / 12); m = m % 12; }
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

const mapPayable = (r: Row): Payable => {
  const base: Payable = {
    id: r['id'] as string,
    householdId: r['household_id'] as string,
    accountId: r['account_id'] as string,
    description: r['description'] as string,
    amountCents: Number(r['amount_cents']),
    dueDate: (r['due_date'] as Date).toISOString().slice(0, 10),
    type: r['type'] as Payable['type'],
    status: r['status'] as Payable['status'],
  };
  if (r['paid_date']) base.paidDate = (r['paid_date'] as Date).toISOString().slice(0, 10);
  if (r['paid_transaction_id']) base.paidTransactionId = r['paid_transaction_id'] as string;
  if (r['frequency']) base.frequency = r['frequency'] as NonNullable<Payable['frequency']>;
  if (r['end_date']) base.endDate = (r['end_date'] as Date).toISOString().slice(0, 10);
  if (r['reminder_days_before'] != null) base.reminderDaysBefore = Number(r['reminder_days_before']);
  if (r['notes']) base.notes = r['notes'] as string;
  if (r['category_id'] != null) base.categoryId = r['category_id'] as string;
  return base;
};

export const createLegacyPostgresPayableStore = (pool: Pool): PayableStore => {
  const base = createPostgresPayableStore(pool);
  const _query = async <R extends Row = Row>(t: string, v: unknown[] = []): Promise<R[]> => {
    const r = await pool.query<R>(t, v);
    return r.rows;
  };

  /**
   * Legacy-schema category gate mirroring the canonical
   * `assertPayableCategoryInTx` (V4.1 Task 2.15): same 404/400 shapes, but
   * the lookup uses the legacy `active` boolean (no `status` column).
   */
  const assertPayableCategoryLegacy = async (
    client: PoolClient,
    householdId: string,
    categoryId: string,
  ): Promise<void> => {
    const res = await client.query<Row>(
      `SELECT id, kind FROM categories WHERE id = $1 AND household_id = $2 AND active = true AND deleted_at IS NULL`,
      [categoryId, householdId],
    );
    if ((res.rowCount ?? 0) === 0 || res.rows.length === 0) throw domainErrors.notFound('Categoria');
    assertCategoryKind(
      { id: categoryId, householdId, kind: String(res.rows[0]!['kind']), status: 'active' },
      'expense',
    );
  };

  return {
    ...base,
    async createPayable(householdId, input) {
      // V4.1 Task 2.15: legacy gate BEFORE the shared insert core — the
      // canonical gate inside base.createPayable would query the `status`
      // column, which does not exist on the legacy schema.
      return withTransaction(pool, async (client) => {
        if (input.categoryId !== undefined) {
          await assertPayableCategoryLegacy(client, householdId, input.categoryId);
        }
        return insertPayableRow(
          async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
            const res = await client.query<R>(text, values);
            return res.rows;
          },
          householdId,
          input,
        );
      });
    },
    async createPayableWithTemplate(householdId, input) {
      return withTransaction(pool, async (client) => {
        // V4.1 Task 2.15: same category gate as createPayable.
        if (input.payable.categoryId !== undefined) {
          await assertPayableCategoryLegacy(client, householdId, input.payable.categoryId);
        }
        const templateId = randomUUID();
        await client.query(
          `INSERT INTO payable_templates (id, household_id, account_id, name, description, amount_cents, frequency, day_of_month, reminder_days_before, notes, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
          [
            templateId,
            householdId,
            input.template.accountId,
            input.template.name,
            input.template.description,
            input.template.amountCents,
            input.template.frequency,
            input.template.dayOfMonth,
            input.template.reminderDaysBefore ?? 0,
            input.template.notes ?? null,
          ],
        );

        const payableId = randomUUID();
        const initialStatus = todayISO() <= input.payable.dueDate ? 'pending' : 'overdue';
        await client.query(
          `INSERT INTO accounts_payable (id, household_id, account_id, category_id, description, amount_cents, due_date, type, frequency, status, notes, template_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            payableId,
            householdId,
            input.payable.accountId,
            input.payable.categoryId ?? null,
            input.payable.description,
            input.payable.amountCents,
            input.payable.dueDate,
            input.payable.type ?? 'recurring',
            input.payable.frequency ?? null,
            initialStatus,
            input.payable.notes ?? null,
            templateId,
          ],
        );
        const rows = await client.query<Row>(
          `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`,
          [payableId, householdId],
        );
        return mapPayable(rows.rows[0]!);
      });
    },

    async updatePayable(householdId, payableId, input) {
      return withTransaction(pool, async (client) => {
        const existing = await client.query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`, [payableId, householdId]);
        if (existing.rowCount === 0 || existing.rows.length === 0) throw domainErrors.notFound('Conta a pagar');
        if (existing.rows[0]!.status === 'cancelled') throw new DomainError('validation.invalid', 'Conta cancelada não pode ser editada', 409);

        // V4.1 Task 2.15: same category gate as createPayable.
        if (input.categoryId !== undefined) {
          await assertPayableCategoryLegacy(client, householdId, input.categoryId);
        }

        // Build update sets for accounts_payable
        const sets: string[] = [];
        const params: unknown[] = [];
        let idx = 1;
        if (input.description !== undefined) { sets.push(`description = $${idx++}`); params.push(input.description); }
        if (input.amountCents !== undefined) { sets.push(`amount_cents = $${idx++}`); params.push(input.amountCents); }
        if (input.dueDate !== undefined) { sets.push(`due_date = $${idx++}`); params.push(input.dueDate); }
        if (input.accountId !== undefined) { sets.push(`account_id = $${idx++}`); params.push(input.accountId); }
        if (input.categoryId !== undefined) { sets.push(`category_id = $${idx++}`); params.push(input.categoryId); }

        // If status is paid and there's a linked transaction, sync it
        const paidTxId = existing.rows[0]!.paid_transaction_id as string | null;
        if (paidTxId && (input.description !== undefined || input.amountCents !== undefined || input.accountId !== undefined || input.categoryId !== undefined)) {
          const txSets: string[] = [];
          const txParams: unknown[] = [];
          let txIdx = 1;
          if (input.description !== undefined) { txSets.push(`description = $${txIdx++}`); txParams.push(input.description); }
          if (input.amountCents !== undefined) { txSets.push(`amount_cents = $${txIdx++}`); txParams.push(input.amountCents); }
          if (input.accountId !== undefined) { txSets.push(`from_account_id = $${txIdx++}`); txParams.push(input.accountId); }
          if (input.categoryId !== undefined) { txSets.push(`category_id = $${txIdx++}`); txParams.push(input.categoryId); }
          txParams.push(paidTxId);
          txParams.push(householdId);
          await client.query(`UPDATE transactions SET ${txSets.join(', ')} WHERE id = $${txIdx} AND household_id = $${txIdx + 1}`, txParams);
        }

        if (sets.length > 0) {
          sets.push(`updated_at = NOW()`);
          params.push(payableId);
          params.push(householdId);
          await client.query(`UPDATE accounts_payable SET ${sets.join(', ')} WHERE id = $${idx} AND household_id = $${idx + 1}`, params);
        }

        const rows = await client.query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`, [payableId, householdId]);
        return mapPayable(rows.rows[0]!);
      });
    },

    async undoPayablePayment(householdId, payableId, opts) {
      return withTransaction(pool, async (client) => {
        const existing = await client.query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`, [payableId, householdId]);
        if (existing.rowCount === 0 || existing.rows.length === 0) throw domainErrors.notFound('Conta a pagar');
        if (existing.rows[0]!.status !== 'paid') throw new DomainError('validation.invalid', 'Apenas contas pagas podem ter pagamento desfeito', 409);
        const paidTxId = existing.rows[0]!.paid_transaction_id as string | null;
        // V4.1 Task 2.x (D4): same paidTransactionId contract as canonical.
        if (opts?.expectedPaidTransactionId !== undefined && paidTxId !== opts.expectedPaidTransactionId) {
          throw new DomainError('validation.invalid', 'paidTransactionId não confere com o pagamento vinculado', 409);
        }
        const dueDate = (existing.rows[0]!.due_date as Date).toISOString().slice(0, 10);
        const newStatus = todayISO() <= dueDate ? 'pending' : 'overdue';
        await client.query(
          `UPDATE accounts_payable SET status = $1, paid_date = NULL, paid_transaction_id = NULL, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
          [newStatus, payableId, householdId],
        );
        if (paidTxId) {
          await client.query(`UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2`, [paidTxId, householdId]);
        }
        const rows = await client.query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`, [payableId, householdId]);
        return mapPayable(rows.rows[0]!);
      });
    },

    async markPayablePaid(householdId, payableId, input) {
      return withTransaction(pool, async (client) => {
        // V4.1 Task 2.2: legacy had no status guard at all — serialize on
        // the row and validate after the lock, mirroring canonical.
        const existing = await client.query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`, [payableId, householdId]);
        if (existing.rowCount === 0 || existing.rows.length === 0) throw domainErrors.notFound('Conta a pagar');
        const p = mapPayable(existing.rows[0]!);
        if (p.status === 'paid' || p.status === 'cancelled') {
          throw new DomainError(
            'validation.invalid',
            `Conta a pagar já está ${p.status === 'paid' ? 'paga' : 'cancelada'}`,
            409,
          );
        }
        const paidDate = input.paidDate ?? todayISO();

        // V4.1 Task 2.3 (D3): the payment always creates the transaction
        // (legacy uses from_account_id). Legacy balances are computed, so
        // there is no materialized balance to debit.
        const txId = randomUUID();
        await client.query(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, category_id)
           VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7)`,
          [txId, householdId, p.description, p.amountCents, paidDate, p.accountId, p.categoryId ?? null],
        );

        await client.query(
          `UPDATE accounts_payable SET status = 'paid', paid_date = $1, paid_transaction_id = $2, updated_at = NOW() WHERE id = $3 AND household_id = $4`,
          [paidDate, txId, payableId, householdId],
        );

        if (p.type === 'recurring' && p.frequency && !input.prepayMonths) {
          const nextDue = getNextDue(p.dueDate, p.frequency);
          if (nextDue && (!p.endDate || nextDue <= p.endDate)) {
            await client.query(
              `INSERT INTO accounts_payable (id, household_id, account_id, description, amount_cents, due_date, type, frequency, end_date, reminder_days_before, notes, category_id, status)
               VALUES ($1,$2,$3,$4,$5,$6,'recurring',$7,$8,$9,$10,$11,'pending')`,
              [randomUUID(), householdId, p.accountId, p.description, p.amountCents, nextDue, p.frequency, p.endDate ?? null, p.reminderDaysBefore ?? 0, p.notes ?? null, p.categoryId ?? null],
            );
          }
        }

        const rows = await client.query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`, [payableId, householdId]);
        return mapPayable(rows.rows[0]!);
      });
    },
  };
};
