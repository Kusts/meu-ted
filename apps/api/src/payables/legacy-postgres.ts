/**
 * Legacy Postgres PayableStore for the pi_financeiro schema (DB_SCHEMA=legacy).
 *
 * The legacy `accounts_payable` table matches the canonical contract for
 * list/create/cancel/reminders, and payable_templates / notification_configs
 * are provided by migration V008. This decorates the canonical store and
 * overrides only markPayablePaid, which differs on the legacy schema:
 *  - accounts_payable has no `paid_amount_cents` column (uses paid_transaction_id).
 *  - transactions use `from_account_id` (there is no `account_id` column).
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Payable, RecurringFrequency } from '../types/domain.js';
import type { PayableStore } from './store.js';
import { createPostgresPayableStore } from './postgres.js';
import { domainErrors } from '../writes/errors.js';

type Row = Record<string, unknown>;

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function getNextDue(currentDue: string, frequency: string): string | null {
  const d = new Date(currentDue + 'T00:00:00');
  switch (frequency) {
    case 'monthly': d.setUTCMonth(d.getUTCMonth() + 1); break;
    case 'quarterly': d.setUTCMonth(d.getUTCMonth() + 3); break;
    case 'yearly': d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    default: return null;
  }
  return d.toISOString().slice(0, 10);
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
  if (r['frequency'] != null) base.frequency = r['frequency'] as RecurringFrequency;
  if (r['end_date'] != null) base.endDate = (r['end_date'] as Date).toISOString().slice(0, 10);
  if (r['paid_date'] != null) base.paidDate = (r['paid_date'] as Date).toISOString().slice(0, 10);
  if (r['reminder_days_before'] != null) base.reminderDaysBefore = Number(r['reminder_days_before']);
  if (r['notes'] != null) base.notes = r['notes'] as string;
  if (r['category_id'] != null) base.categoryId = r['category_id'] as string;
  return base;
};

export const createLegacyPostgresPayableStore = (pool: Pool): PayableStore => {
  const base = createPostgresPayableStore(pool);
  const query = async <R extends Row = Row>(t: string, v: unknown[] = []): Promise<R[]> => {
    const r = await pool.query<R>(t, v);
    return r.rows;
  };

  return {
    ...base,
    async markPayablePaid(householdId, payableId, input) {
      const existing = await query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`, [payableId, householdId]);
      if (existing.length === 0) throw domainErrors.notFound('Conta a pagar');
      const p = mapPayable(existing[0]!);
      const paidDate = input.paidDate ?? todayISO();

      // Create the payment transaction first (legacy uses from_account_id) so we
      // can link it via paid_transaction_id (legacy has no paid_amount_cents).
      let txId: string | null = null;
      if (input.createTransaction !== false) {
        txId = randomUUID();
        await query(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, from_account_id, category_id)
           VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7)`,
          [txId, householdId, p.description, p.amountCents, paidDate, p.accountId, p.categoryId ?? null],
        );
      }

      await query(
        `UPDATE accounts_payable SET status = 'paid', paid_date = $1, paid_transaction_id = $2, updated_at = NOW() WHERE id = $3`,
        [paidDate, txId, payableId],
      );

      if (p.type === 'recurring' && p.frequency && !input.prepayMonths) {
        const nextDue = getNextDue(p.dueDate, p.frequency);
        if (nextDue && (!p.endDate || nextDue <= p.endDate)) {
          await query(
            `INSERT INTO accounts_payable (id, household_id, account_id, description, amount_cents, due_date, type, frequency, end_date, reminder_days_before, notes, category_id, status)
             VALUES ($1,$2,$3,$4,$5,$6,'recurring',$7,$8,$9,$10,$11,'pending')`,
            [randomUUID(), householdId, p.accountId, p.description, p.amountCents, nextDue, p.frequency, p.endDate ?? null, p.reminderDaysBefore ?? 0, p.notes ?? null, p.categoryId ?? null],
          );
        }
      }

      const rows = await query<Row>(`SELECT * FROM accounts_payable WHERE id = $1`, [payableId]);
      return mapPayable(rows[0]!);
    },
  };
};
