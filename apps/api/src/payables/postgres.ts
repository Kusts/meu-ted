import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  NotificationConfig,
  Payable,
  PayableTemplate,
} from "../types/domain.js";
import { DomainError, domainErrors } from "../writes/errors.js";
import { withTransaction, } from "../db/pool.js";
import type { PayableStore } from "./store.js";

type Row = Record<string, unknown>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function nextTemplateDue(dayOfMonth: number, today: Date): string {
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  let candidate = new Date(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonth(year, month))));
  if (candidate < today) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    candidate = new Date(Date.UTC(year, month, Math.min(dayOfMonth, daysInMonth(year, month))));
  }
  return candidate.toISOString().slice(0, 10);
}

function opt<T extends Record<string, unknown>>(obj: T, props: Partial<T>): T {
  const result = { ...obj };
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null) (result as any)[k] = v;
  }
  return result;
}

const mapPayable = (r: Row): Payable =>
  opt<Payable>(
    {
      id: r["id"] as string,
      householdId: r["household_id"] as string,
      accountId: r["account_id"] as string,
      description: r["description"] as string,
      amountCents: Number(r["amount_cents"]),
      dueDate: (r["due_date"] as Date).toISOString().slice(0, 10),
      type: r["type"] as Payable["type"],
      status: r["status"] as Payable["status"],
    },
    {
      frequency: (r["frequency"] as Payable["frequency"]) ?? undefined,
      endDate: r["end_date"]
        ? (r["end_date"] as Date).toISOString().slice(0, 10)
        : undefined,
      paidDate: r["paid_date"]
        ? (r["paid_date"] as Date).toISOString().slice(0, 10)
        : undefined,
      paidAmountCents:
        r["paid_amount_cents"] != null
          ? Number(r["paid_amount_cents"])
          : undefined,
      paidTransactionId:
        r["paid_transaction_id"] != null
          ? String(r["paid_transaction_id"])
          : undefined,
      reminderDaysBefore:
        r["reminder_days_before"] != null
          ? Number(r["reminder_days_before"])
          : undefined,
      notes: (r["notes"] as string) ?? undefined,
      categoryId: (r["category_id"] as string) ?? undefined,
    } as Partial<Payable>,
  );

const mapTemplate = (r: Row): PayableTemplate =>
  opt<PayableTemplate>(
    {
      id: r["id"] as string,
      householdId: r["household_id"] as string,
      accountId: r["account_id"] as string,
      name: r["name"] as string,
      description: r["description"] as string,
      amountCents: Number(r["amount_cents"]),
      frequency: r["frequency"] as PayableTemplate["frequency"],
      dayOfMonth: Number(r["day_of_month"]),
      active: r["active"] as boolean,
    },
    {
      reminderDaysBefore:
        r["reminder_days_before"] != null
          ? Number(r["reminder_days_before"])
          : undefined,
      notes: (r["notes"] as string) ?? undefined,
    } as Partial<PayableTemplate>,
  );

const mapNotification = (r: Row): NotificationConfig =>
  opt<NotificationConfig>(
    {
      id: r["id"] as string,
      householdId: r["household_id"] as string,
      chatId: r["chat_id"] as string,
      notificationType: r[
        "notification_type"
      ] as NotificationConfig["notificationType"],
      enabled: r["enabled"] as boolean,
      daysOfWeek: (r["days_of_week"] as number[]) ?? [1, 2, 3, 4, 5],
    },
    {
      scheduleHour:
        r["schedule_hour"] != null ? Number(r["schedule_hour"]) : undefined,
      scheduleWindowMinutes:
        r["schedule_window_minutes"] != null
          ? Number(r["schedule_window_minutes"])
          : undefined,
      scheduleMinute:
        r["schedule_minute"] != null ? Number(r["schedule_minute"]) : undefined,
      thresholdDays:
        r["threshold_days"] != null ? Number(r["threshold_days"]) : undefined,
      timezone: (r["timezone"] as string) ?? undefined,
      lastRunAt: r["last_run_at"]
        ? new Date(r["last_run_at"] as string).toISOString()
        : undefined,
      lastSuccessAt: r["last_success_at"]
        ? new Date(r["last_success_at"] as string).toISOString()
        : undefined,
      lastFailureAt: r["last_failure_at"]
        ? new Date(r["last_failure_at"] as string).toISOString()
        : undefined,
      lastRunStatus:
        (r["last_run_status"] as NotificationConfig["lastRunStatus"]) ??
        undefined,
      lastSentCount:
        r["last_sent_count"] != null ? Number(r["last_sent_count"]) : undefined,
      lastRemovedCount:
        r["last_removed_count"] != null
          ? Number(r["last_removed_count"])
          : undefined,
      lastError: (r["last_error"] as string) ?? undefined,
    } as Partial<NotificationConfig>,
  );

function getNextDue(currentDue: string, frequency: string): string | null {
  const d = new Date(currentDue + "T00:00:00");
  switch (frequency) {
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    default:
      return null;
  }
  return d.toISOString().slice(0, 10);
}

export const createPostgresPayableStore = (pool: Pool): PayableStore => {
  const query = async <R extends Row = Row>(
    text: string,
    values: unknown[] = [],
  ): Promise<R[]> => {
    const res = await pool.query<R>(text, values);
    return res.rows;
  };

  return {
    async listPayables(householdId, filters) {
      const params: unknown[] = [householdId];
      const conditions: string[] = ['household_id = $1', 'deleted_at IS NULL'];
      if (filters?.status) {

        params.push(filters.status);
        conditions.push(`status = $${params.length}`);
      }
      if (filters?.type) {
        params.push(filters.type);
        conditions.push(`type = $${params.length}`);
      }
      if (filters?.dueWithinDays) {
        const today = todayISO();
        const limit = new Date();
        limit.setDate(limit.getDate() + filters.dueWithinDays);
        params.push(today);
        conditions.push(`due_date >= $${params.length}`);
        params.push(limit.toISOString().slice(0, 10));
        conditions.push(`due_date <= $${params.length}`);
        conditions.push(`status = 'pending'`);
      }
      const rows = await query<Row>(
        `SELECT * FROM accounts_payable WHERE ${conditions.join(" AND ")} ORDER BY due_date ASC`,
        params,
      );
      return rows.map(mapPayable);
    },

    async createPayable(householdId, input) {
      const id = randomUUID();
      await query(
        `INSERT INTO accounts_payable (id, household_id, account_id, description, amount_cents, due_date, type, frequency, end_date, reminder_days_before, notes, category_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')`,
        [
          id,
          householdId,
          input.accountId,
          input.description,
          input.amountCents,
          input.dueDate,
          input.type ?? "one_time",
          input.frequency ?? null,
          input.endDate ?? null,
          input.reminderDaysBefore ?? 0,
          input.notes ?? null,
          input.categoryId ?? null,
        ],
      );
      const rows = await query<Row>(
        `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`,
        [id, householdId],
      );
      return mapPayable(rows[0]!);
    },

    async markPayablePaid(householdId, payableId, input) {
      return withTransaction(pool, async (client) => {
        // V4.1 Task 2.2: serialize concurrent payments on the payable row.
        // The status check below the lock is the single decision point, so
        // two concurrent payers converge on exactly one financial effect.
        const existing = await client.query<Row>(
          `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`,
          [payableId, householdId],
        );
        if (existing.rowCount === 0 || existing.rows.length === 0) throw domainErrors.notFound("Conta a pagar");
        const p = mapPayable(existing.rows[0]!);
        if (p.status === "paid" || p.status === "cancelled") {
          throw new DomainError(
            "validation.invalid",
            `Conta a pagar já está ${p.status === "paid" ? "paga" : "cancelada"}`,
            409,
          );
        }
        // V4.1 Task 2.3 (D1/D3): the payment always creates the expense
        // transaction AND debits the paying account in the same tx. No
        // silent clamp: insufficient balance rejects like payStatement.
        const accRows = await client.query<Row>(
          `SELECT id, kind, balance_cents, status FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`,
          [p.accountId, householdId],
        );
        if (accRows.rowCount === 0 || accRows.rows.length === 0) throw domainErrors.notFound("Conta");
        const acc = accRows.rows[0]!;
        if (acc["status"] !== "active") throw domainErrors.notFound("Conta");
        if (acc["kind"] === "credit_card") {
          throw new DomainError("validation.invalid", "compra no cartão deve usar /cards/purchases.", 422);
        }
        if (Number(acc["balance_cents"]) < p.amountCents) {
          throw domainErrors.invalid("amountCents", "saldo insuficiente na conta de origem");
        }
        const paidDate = input.paidDate ?? todayISO();
        const paidTxId = randomUUID();
        await client.query(
          `INSERT INTO transactions (id, household_id, kind, description, amount_cents, date, account_id, category_id)
           VALUES ($1,$2,'expense',$3,$4,$5,$6,$7)`,
          [
            paidTxId,
            householdId,
            p.description,
            p.amountCents,
            paidDate,
            p.accountId,
            p.categoryId ?? null,
          ],
        );
        await client.query(
          `UPDATE accounts SET balance_cents = balance_cents - $1, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
          [p.amountCents, p.accountId, householdId],
        );
        await client.query(
          `UPDATE accounts_payable SET status = 'paid', paid_date = $1, paid_amount_cents = amount_cents, paid_transaction_id = $2, updated_at = NOW() WHERE id = $3 AND household_id = $4`,
          [paidDate, paidTxId, payableId, householdId],
        );

        if (p.type === "recurring" && p.frequency && !input.prepayMonths) {
          const nextDue = getNextDue(p.dueDate, p.frequency);
          if (nextDue && (!p.endDate || nextDue <= p.endDate)) {
            const nextId = randomUUID();
            await client.query(
              `INSERT INTO accounts_payable (id, household_id, account_id, description, amount_cents, due_date, type, frequency, end_date, reminder_days_before, notes, category_id, status)
               VALUES ($1,$2,$3,$4,$5,$6,'recurring',$7,$8,$9,$10,$11,'pending')`,
              [
                nextId,
                householdId,
                p.accountId,
                p.description,
                p.amountCents,
                nextDue,
                p.frequency,
                p.endDate ?? null,
                p.reminderDaysBefore ?? 0,
                p.notes ?? null,
                p.categoryId ?? null,
              ],
            );
          }
        }

        const rows = await client.query<Row>(
          `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`,
          [payableId, householdId],
        );
        return mapPayable(rows.rows[0]!);
      });
    },


    async cancelPayable(householdId, payableId, _reason) {
      const existing = await query<Row>(
        `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
        [payableId, householdId],
      );
      if (existing.length === 0) throw domainErrors.notFound("Conta a pagar");
      await query(
        `UPDATE accounts_payable SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND household_id = $2`,
        [payableId, householdId],
      );
      const rows = await query<Row>(
        `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`,
        [payableId, householdId],
      );
      return mapPayable(rows[0]!);
    },

    async updatePayable(householdId, payableId, input) {
      const existing = await query<Row>(
        `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
        [payableId, householdId],
      );
      if (existing.length === 0) throw domainErrors.notFound("Conta a pagar");
      if (existing[0]!.status === "cancelled")
        throw new DomainError(
          "validation.invalid",
          "Conta cancelada não pode ser editada",
          409,
        );
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;
      if (input.description !== undefined) {
        sets.push(`description = $${idx++}`);
        params.push(input.description);
      }
      if (input.amountCents !== undefined) {
        sets.push(`amount_cents = $${idx++}`);
        params.push(input.amountCents);
      }
      if (input.dueDate !== undefined) {
        sets.push(`due_date = $${idx++}`);
        params.push(input.dueDate);
      }
      if (input.accountId !== undefined) {
        sets.push(`account_id = $${idx++}`);
        params.push(input.accountId);
      }
      if (input.categoryId !== undefined) {
        sets.push(`category_id = $${idx++}`);
        params.push(input.categoryId);
      }
      if (sets.length === 0) return mapPayable(existing[0]!);
      sets.push(`updated_at = NOW()`);
      params.push(payableId);
      params.push(householdId);
      await query(
        `UPDATE accounts_payable SET ${sets.join(", ")} WHERE id = $${idx} AND household_id = $${idx + 1}`,
        params,
      );
      const rows = await query<Row>(
        `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`,
        [payableId, householdId],
      );
      return mapPayable(rows[0]!);
    },

    async undoPayablePayment(householdId, payableId, opts) {
      return withTransaction(pool, async (client) => {
        const existing = await client.query<Row>(
          `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`,
          [payableId, householdId],
        );
        if (existing.rowCount === 0 || existing.rows.length === 0) throw domainErrors.notFound("Conta a pagar");
        if (existing.rows[0]!.status !== "paid")
          throw new DomainError(
            "validation.invalid",
            "Apenas contas pagas podem ter pagamento desfeito",
            409,
          );
        const p = mapPayable(existing.rows[0]!);
        // V4.1 Task 2.x (D4): the undo contract carries the linked
        // paidTransactionId; a caller that knows it must present the right
        // one, otherwise the undo is rejected instead of reversing the
        // wrong financial effect.
        if (
          opts?.expectedPaidTransactionId !== undefined &&
          p.paidTransactionId !== opts.expectedPaidTransactionId
        ) {
          throw new DomainError(
            "validation.invalid",
            "paidTransactionId não confere com o pagamento vinculado",
            409,
          );
        }
        const newStatus = todayISO() <= p.dueDate ? "pending" : "overdue";
        await client.query(
          `UPDATE accounts_payable SET status = $1, paid_date = NULL, paid_amount_cents = NULL, paid_transaction_id = NULL, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
          [newStatus, payableId, householdId],
        );
        if (p.paidTransactionId) {
          // Reverse the debit booked by markPayablePaid in the same tx, then
          // soft-delete the linked expense. The recurring successor (if any)
          // is intentionally kept (D4).
          const txRows = await client.query<Row>(
            `SELECT amount_cents, account_id FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
            [p.paidTransactionId, householdId],
          );
          if ((txRows.rowCount ?? 0) > 0) {
            await client.query(
              `SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL FOR UPDATE`,
              [txRows.rows[0]!["account_id"], householdId],
            );
            await client.query(
              `UPDATE accounts SET balance_cents = balance_cents + $1, updated_at = NOW() WHERE id = $2 AND household_id = $3`,
              [Number(txRows.rows[0]!["amount_cents"]), txRows.rows[0]!["account_id"], householdId],
            );
          }
          await client.query(
            `UPDATE transactions SET deleted_at = NOW() WHERE id = $1 AND household_id = $2`,
            [p.paidTransactionId, householdId],
          );
        }
        const rows = await client.query<Row>(
          `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2`,
          [payableId, householdId],
        );
        return mapPayable(rows.rows[0]!);
      });
    },


    async listTemplates(householdId, activeOnly) {
      const conditions: string[] = ['household_id = $1'];
      if (activeOnly !== false) conditions.push("active = true");

      const rows = await query<Row>(
        `SELECT * FROM payable_templates WHERE ${conditions.join(" AND ")} ORDER BY name ASC`,
        [householdId],
      );
      return rows.map(mapTemplate);
    },

    async createTemplate(householdId, input) {
      const id = randomUUID();
      await query(
        `INSERT INTO payable_templates (id, household_id, account_id, name, description, amount_cents, frequency, day_of_month, reminder_days_before, notes, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
        [
          id,
          householdId,
          input.accountId,
          input.name,
          input.description,
          input.amountCents,
          input.frequency,
          input.dayOfMonth,
          input.reminderDaysBefore ?? 0,
          input.notes ?? null,
        ],
      );
      const rows = await query<Row>(
        `SELECT * FROM payable_templates WHERE id = $1 AND household_id = $2`,
        [id, householdId],
      );
      return mapTemplate(rows[0]!);
    },

    async createPayableFromTemplate(householdId, input) {
      let t: PayableTemplate | undefined;
      if (input.templateId) {
        const rows = await query<Row>(
          `SELECT * FROM payable_templates WHERE id = $1 AND household_id = $2`,
          [input.templateId, householdId],
        );
        if (rows.length > 0) t = mapTemplate(rows[0]!);
      } else if (input.templateName) {
        const rows = await query<Row>(
          `SELECT * FROM payable_templates WHERE name = $1 AND household_id = $2`,
          [input.templateName, householdId],
        );
        if (rows.length > 0) t = mapTemplate(rows[0]!);
      }
      if (!t) throw domainErrors.notFound("Template");

      const p = await this.createPayable(householdId, {
        accountId: t.accountId,
        description: t.description,
        amountCents: input.amountOverrideCents ?? t.amountCents,
        dueDate: input.dueDate,
        type: "recurring",
        frequency: t.frequency,
        ...(t.reminderDaysBefore != null
          ? { reminderDaysBefore: t.reminderDaysBefore }
          : {}),
        ...(t.notes ? { notes: t.notes } : {}),
      });
      return p;
    },
    async createPayableWithTemplate(householdId, input) {
      return withTransaction(pool, async (client) => {
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
        const initialStatus = todayISO() <= input.payable.dueDate ? "pending" : "overdue";
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
            input.payable.type ?? "recurring",
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

    async autoCreateFromTemplates(householdId, daysAhead = 30) {

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const limit = new Date(today.getTime() + daysAhead * 86_400_000).toISOString().slice(0, 10);
      const templates = (await query<Row>(
        `SELECT * FROM payable_templates WHERE household_id = $1 AND active = true`,
        [householdId],
      )).map(mapTemplate);
      const created: Payable[] = [];
      for (const template of templates) {
        const dueDate = nextTemplateDue(template.dayOfMonth, today);
        if (dueDate > limit) continue;
        const existing = await query<Row>(
          `SELECT id FROM accounts_payable WHERE household_id = $1 AND description = $2 AND due_date = $3::date AND deleted_at IS NULL LIMIT 1`,
          [householdId, template.description, dueDate],
        );
        if (existing.length > 0) continue;
        created.push(await this.createPayableFromTemplate(householdId, {
          templateId: template.id,
          dueDate,
        }));
      }
      return created;
    },

    async refreshPayableStatus(householdId) {
      const today = todayISO();
      await query(
        `UPDATE accounts_payable SET status = 'overdue', updated_at = NOW()
          WHERE household_id = $1 AND deleted_at IS NULL AND status = 'pending' AND due_date < $2::date`,
        [householdId, today],
      );
      const rows = await query<Row>(
        `SELECT * FROM accounts_payable WHERE household_id = $1 AND deleted_at IS NULL ORDER BY due_date ASC`,
        [householdId],
      );
      return rows.map(mapPayable);
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
      const rows = await query<Row>(
        `SELECT * FROM notification_configs WHERE household_id = $1`,
        [householdId],
      );
      return rows.map(mapNotification);
    },

    async listAllNotifications() {
      const rows = await query<Row>(
        `SELECT * FROM notification_configs WHERE enabled = true ORDER BY household_id, id`,
      );
      return rows.map(mapNotification);
    },
    async updateNotificationExecution(notificationId, householdId, state) {
      await query(
        `UPDATE notification_configs SET
           last_run_at = $1,
           last_run_status = $2,
           last_sent_count = $3,
           last_removed_count = $4,
           last_error = $5,
           last_success_at = CASE WHEN $2 IN ('sent', 'deduplicated') THEN $1 ELSE last_success_at END,
           last_failure_at = CASE WHEN $2 = 'failed' THEN $1 ELSE last_failure_at END,
           updated_at = NOW()
          WHERE id = $6 AND household_id = $7`,
        [
          state.executedAt,
          state.status,
          state.sent,
          state.removed,
          state.error ?? null,
          notificationId,
          householdId,
        ],
      );
    },
    async configureNotification(householdId, input) {
      const existing = await query<Row>(
        `SELECT * FROM notification_configs WHERE household_id = $1 AND chat_id = $2 AND notification_type = $3`,
        [householdId, input.chatId, input.notificationType],
      );
      if (existing.length > 0) {
        await query(
          `UPDATE notification_configs SET enabled = $1, schedule_hour = $2, schedule_minute = $3, schedule_window_minutes = $4, days_of_week = $5, threshold_days = $6, timezone = $7, updated_at = NOW()
           WHERE id = $8 AND household_id = $9`,
          [
            input.enabled,
            input.scheduleHour ?? 9,
            input.scheduleMinute ?? 0,
            input.scheduleWindowMinutes ?? 60,
            input.daysOfWeek ?? [1, 2, 3, 4, 5],
            input.thresholdDays ?? 1,
            input.timezone ?? "UTC",
            existing[0]!["id"],
            householdId,
          ],
        );
        const rows = await query<Row>(
          `SELECT * FROM notification_configs WHERE id = $1 AND household_id = $2`,
          [existing[0]!["id"], householdId],
        );
        const row = rows[0];
        if (!row) throw domainErrors.notFound("Notificação");
        return mapNotification(row);
      }
      const id = randomUUID();
      await query(
        `INSERT INTO notification_configs (id, household_id, chat_id, notification_type, enabled, schedule_hour, schedule_minute, schedule_window_minutes, days_of_week, threshold_days, timezone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          householdId,
          input.chatId,
          input.notificationType,
          input.enabled,
          input.scheduleHour ?? 9,
          input.scheduleMinute ?? 0,
          input.scheduleWindowMinutes ?? 60,
          input.daysOfWeek ?? [1, 2, 3, 4, 5],
          input.thresholdDays ?? 1,
          input.timezone ?? "UTC",
        ],
      );
      const rows = await query<Row>(
        `SELECT * FROM notification_configs WHERE id = $1 AND household_id = $2`,
        [id, householdId],
      );
      const row = rows[0];
      if (!row) throw domainErrors.notFound("Notificação");
      return mapNotification(row);
    },
  };
};
