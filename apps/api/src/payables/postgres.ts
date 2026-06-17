import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Payable, PayableTemplate, NotificationConfig } from '../types/domain.js';
import type { PayableStore } from './store.js';
import { domainErrors } from '../writes/errors.js';

type Row = Record<string, unknown>;

function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

const mapPayable = (r: Row): Payable => opt<Payable>(
  { id: r['id'] as string, householdId: r['household_id'] as string, accountId: r['account_id'] as string, description: r['description'] as string, amountCents: Number(r['amount_cents']), dueDate: (r['due_date'] as Date).toISOString().slice(0, 10), type: r['type'] as Payable['type'], status: r['status'] as Payable['status'] },
  { frequency: (r['frequency'] as Payable['frequency']) ?? undefined, endDate: r['end_date'] ? (r['end_date'] as Date).toISOString().slice(0, 10) : undefined, paidDate: r['paid_date'] ? (r['paid_date'] as Date).toISOString().slice(0, 10) : undefined, paidAmountCents: r['paid_amount_cents'] != null ? Number(r['paid_amount_cents']) : undefined, reminderDaysBefore: r['reminder_days_before'] != null ? Number(r['reminder_days_before']) : undefined, notes: (r['notes'] as string) ?? undefined, categoryId: (r['category_id'] as string) ?? undefined } as Partial<Payable>,
);

const mapTemplate = (r: Row): PayableTemplate => opt<PayableTemplate>(
  { id: r['id'] as string, householdId: r['household_id'] as string, accountId: r['account_id'] as string, name: r['name'] as string, description: r['description'] as string, amountCents: Number(r['amount_cents']), frequency: r['frequency'] as PayableTemplate['frequency'], dayOfMonth: Number(r['day_of_month']), active: r['active'] as boolean },
  { reminderDaysBefore: r['reminder_days_before'] != null ? Number(r['reminder_days_before']) : undefined, notes: (r['notes'] as string) ?? undefined } as Partial<PayableTemplate>,
);

const mapNotification = (r: Row): NotificationConfig => opt<NotificationConfig>(
  { id: r['id'] as string, householdId: r['household_id'] as string, chatId: r['chat_id'] as string, notificationType: r['notification_type'] as NotificationConfig['notificationType'], enabled: r['enabled'] as boolean, daysOfWeek: (r['days_of_week'] as number[]) ?? [1,2,3,4,5] },
  { scheduleHour: r['schedule_hour'] != null ? Number(r['schedule_hour']) : undefined, scheduleMinute: r['schedule_minute'] != null ? Number(r['schedule_minute']) : undefined, thresholdDays: r['threshold_days'] != null ? Number(r['threshold_days']) : undefined } as Partial<NotificationConfig>,
);

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

export const createPostgresPayableStore = (pool: Pool): PayableStore => {
  const query = async <R extends Row = Row>(text: string, values: unknown[] = []): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  return {
    async listPayables(householdId, filters) {
      const params: unknown[] = [householdId];
      const conditions: string[] = ['household_id = $1', 'deleted_at IS NULL'];
      if (filters?.status) { params.push(filters.status); conditions.push(`status = $${params.length}`); }
      if (filters?.type) { params.push(filters.type); conditions.push(`type = $${params.length}`); }
      if (filters?.dueWithinDays) {
        const today = todayISO();
        const limit = new Date(); limit.setDate(limit.getDate() + filters.dueWithinDays);
        params.push(today); conditions.push(`due_date >= $${params.length}`);
        params.push(limit.toISOString().slice(0, 10)); conditions.push(`due_date <= $${params.length}`);
        conditions.push(`status = 'pending'`);
      }
      const rows = await query<Row>(
        `SELECT * FROM accounts_payable WHERE ${conditions.join(' AND ')} ORDER BY due_date ASC`,
        params,
      );
      return rows.map(mapPayable);
    },

    async createPayable(householdId, input) {
      const id = randomUUID();
      await query(
        `INSERT INTO accounts_payable (id, household_id, account_id, description, amount_cents, due_date, type, frequency, end_date, reminder_days_before, notes, category_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')`,
        [id, householdId, input.accountId, input.description, input.amountCents, input.dueDate, input.type ?? 'one_time', input.frequency ?? null, input.endDate ?? null, input.reminderDaysBefore ?? 0, input.notes ?? null, input.categoryId ?? null],
      );
      const rows = await query<Row>(`SELECT * FROM accounts_payable WHERE id = $1`, [id]);
      return mapPayable(rows[0]!);
    },

    async markPayablePaid(householdId, payableId, input) {
      const existing = await query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`, [payableId, householdId]);
      if (existing.length === 0) throw domainErrors.notFound('Conta a pagar');
      const p = mapPayable(existing[0]!);
      const paidDate = input.paidDate ?? todayISO();
      await query(`UPDATE accounts_payable SET status = 'paid', paid_date = $1, paid_amount_cents = amount_cents, updated_at = NOW() WHERE id = $2`, [paidDate, payableId]);

      if (p.type === 'recurring' && p.frequency && !input.prepayMonths) {
        const nextDue = getNextDue(p.dueDate, p.frequency);
        if (nextDue && (!p.endDate || nextDue <= p.endDate)) {
          const nextId = randomUUID();
          await query(
            `INSERT INTO accounts_payable (id, household_id, account_id, description, amount_cents, due_date, type, frequency, end_date, reminder_days_before, notes, category_id, status)
             VALUES ($1,$2,$3,$4,$5,$6,'recurring',$7,$8,$9,$10,$11,'pending')`,
            [nextId, householdId, p.accountId, p.description, p.amountCents, nextDue, p.frequency, p.endDate ?? null, p.reminderDaysBefore ?? 0, p.notes ?? null, p.categoryId ?? null],
          );
        }
      }

      if (input.createTransaction !== false) {
        const txId = randomUUID();
        await query(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id)
           VALUES ($1,$2,'expense',$3,$4,$5,$6,$7)`,
          [txId, householdId, p.description, p.amountCents, paidDate, p.accountId, p.categoryId ?? null],
        );
      }

      const rows = await query<Row>(`SELECT * FROM accounts_payable WHERE id = $1`, [payableId]);
      return mapPayable(rows[0]!);
    },

    async cancelPayable(householdId, payableId, _reason) {
      const existing = await query<Row>(`SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`, [payableId, householdId]);
      if (existing.length === 0) throw domainErrors.notFound('Conta a pagar');
      await query(`UPDATE accounts_payable SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [payableId]);
      const rows = await query<Row>(`SELECT * FROM accounts_payable WHERE id = $1`, [payableId]);
      return mapPayable(rows[0]!);
    },

    async listTemplates(householdId, activeOnly) {
      const conditions = ['household_id = $1'];
      if (activeOnly !== false) conditions.push('active = true');
      const rows = await query<Row>(`SELECT * FROM payable_templates WHERE ${conditions.join(' AND ')} ORDER BY name ASC`, [householdId]);
      return rows.map(mapTemplate);
    },

    async createTemplate(householdId, input) {
      const id = randomUUID();
      await query(
        `INSERT INTO payable_templates (id, household_id, account_id, name, description, amount_cents, frequency, day_of_month, reminder_days_before, notes, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
        [id, householdId, input.accountId, input.name, input.description, input.amountCents, input.frequency, input.dayOfMonth, input.reminderDaysBefore ?? 0, input.notes ?? null],
      );
      const rows = await query<Row>(`SELECT * FROM payable_templates WHERE id = $1`, [id]);
      return mapTemplate(rows[0]!);
    },

    async createPayableFromTemplate(householdId, input) {
      let t: PayableTemplate | undefined;
      if (input.templateId) {
        const rows = await query<Row>(`SELECT * FROM payable_templates WHERE id = $1 AND household_id = $2`, [input.templateId, householdId]);
        if (rows.length > 0) t = mapTemplate(rows[0]!);
      } else if (input.templateName) {
        const rows = await query<Row>(`SELECT * FROM payable_templates WHERE name = $1 AND household_id = $2`, [input.templateName, householdId]);
        if (rows.length > 0) t = mapTemplate(rows[0]!);
      }
      if (!t) throw domainErrors.notFound('Template');

      const p = await this.createPayable(householdId, {
        accountId: t.accountId, description: t.description,
        amountCents: input.amountOverrideCents ?? t.amountCents,
        dueDate: input.dueDate, type: 'recurring', frequency: t.frequency,
        ...(t.reminderDaysBefore != null ? { reminderDaysBefore: t.reminderDaysBefore } : {}),
        ...(t.notes ? { notes: t.notes } : {}),
      });
      return p;
    },

    async listReminders(householdId) {
      const today = todayISO();
      const rows = await query<Row>(
        `SELECT * FROM accounts_payable WHERE household_id = $1 AND deleted_at IS NULL AND status IN ('overdue', 'pending') AND due_date <= $2 ORDER BY due_date ASC`,
        [householdId, today],
      );
      return rows.map(mapPayable);
    },

    async listNotifications(householdId) {
      const rows = await query<Row>(`SELECT * FROM notification_configs WHERE household_id = $1`, [householdId]);
      return rows.map(mapNotification);
    },

    async configureNotification(householdId, input) {
      const existing = await query<Row>(
        `SELECT * FROM notification_configs WHERE household_id = $1 AND chat_id = $2 AND notification_type = $3`,
        [householdId, input.chatId, input.notificationType],
      );
      if (existing.length > 0) {
        await query(
          `UPDATE notification_configs SET enabled = $1, schedule_hour = $2, schedule_minute = $3, days_of_week = $4, threshold_days = $5, updated_at = NOW()
           WHERE id = $6`,
          [input.enabled, input.scheduleHour ?? 9, input.scheduleMinute ?? 0, input.daysOfWeek ?? [1,2,3,4,5], input.thresholdDays ?? 1, existing[0]!['id']],
        );
        const rows = await query<Row>(`SELECT * FROM notification_configs WHERE id = $1`, [existing[0]!['id']]);
        return mapNotification(rows[0]!);
      }
      const id = randomUUID();
      await query(
        `INSERT INTO notification_configs (id, household_id, chat_id, notification_type, enabled, schedule_hour, schedule_minute, days_of_week, threshold_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, householdId, input.chatId, input.notificationType, input.enabled, input.scheduleHour ?? 9, input.scheduleMinute ?? 0, input.daysOfWeek ?? [1,2,3,4,5], input.thresholdDays ?? 1],
      );
      const rows = await query<Row>(`SELECT * FROM notification_configs WHERE id = $1`, [id]);
      return mapNotification(rows[0]!);
    },
  };
};
