/**
 * accounts_payable — Tools para gestão de contas a pagar
 *
 * 5 tools:
 * - create_account_payable: cria conta (one_time ou recurring)
 * - list_accounts_payable: lista com filtros (status, type, days)
 * - mark_account_paid: marca como paga + cria expense automaticamente
 * - cancel_account_payable: cancela conta (ex: assinatura cancelada)
 * - check_payable_reminders: retorna lembretes (deve ser chamado no início)
 * - refresh_payable_status: atualiza status (pending → overdue, recurring → próximo)
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  refreshAccountsPayable,
  getAccountsNeedingReminder,
  markReminderSent,
  computeEffectiveStatus,
  getNextDueDate,
  formatReminder,
  formatAccountsList,
  type AccountPayableWithDetails,
} from "./accounts-payable.js";
import { autoCategorize } from "./categorizer.js";

const HOUSEHOLD_DEFAULT = process.env.HOUSEHOLD_ID || "550e8400-e29b-41d4-a716-446655440000";

const fmt = (cents: number | string) => `R$ ${(typeof cents === "string" ? parseInt(cents, 10) : cents) / 100}`;

/**
 * create_account_payable
 */
export const createAccountPayable: ToolDefinition = {
  name: "create_account_payable",
  description: "Cria uma conta a pagar. Suporta one_time (avulsa) e recurring (mensal, trimestral, anual).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    accountId: Type.String(),
    description: Type.String(),
    amountCents: Type.Number({ minimum: 1 }),
    dueDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    type: Type.Optional(Type.Union([Type.Literal("recurring"), Type.Literal("one_time")])),
    frequency: Type.Optional(Type.Union([Type.Literal("monthly"), Type.Literal("quarterly"), Type.Literal("yearly")])),
    endDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
    reminderDaysBefore: Type.Optional(Type.Integer({ minimum: 0, maximum: 30 })),
    notes: Type.Optional(Type.String()),
    sourceMessageId: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const type = params.type || "one_time";

      // Validate
      if (type === "recurring" && !params.frequency) {
        return { success: false, error: "frequency_required", message: "Contas recorrentes precisam de frequency" };
      }
      if (type === "one_time" && params.frequency) {
        return { success: false, error: "frequency_not_allowed", message: "Contas one_time não aceitam frequency" };
      }

      // Auto-categorize
      const catResult = await autoCategorize(pool, householdId, params.description, "expense");
      const categoryId = catResult?.id || null;
      const categoryMatch = catResult?.match;

      // Insert
      const result = await pool.query<{ rows: any[] }>(
        `INSERT INTO accounts_payable
         (household_id, account_id, category_id, description, amount_cents,
          type, frequency, due_date, end_date, reminder_days_before, notes, source_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12)
         RETURNING id, description, amount_cents, due_date::text, type, frequency, status, created_at`,
        [
          householdId, params.accountId, categoryId, params.description,
          params.amountCents, type, params.frequency || null, params.dueDate,
          params.endDate || null, params.reminderDaysBefore ?? 3,
          params.notes || null, params.sourceMessageId || null,
        ]
      );
      const ap = result.rows[0];

      return {
        success: true,
        payableId: ap.id,
        description: ap.description,
        amountCents: parseInt(ap.amount_cents, 10),
        dueDate: ap.due_date,
        type: ap.type,
        frequency: ap.frequency,
        status: ap.status,
        categoryId,
        categoryMatch: categoryMatch ? {
          name: categoryMatch.fullName,
          confidence: Math.round(categoryMatch.confidence * 100),
        } : null,
        message: `✅ Conta a pagar criada: ${params.description} (${fmt(params.amountCents)}) — vence ${ap.due_date}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * list_accounts_payable
 */
export const listAccountsPayable: ToolDefinition = {
  name: "list_accounts_payable",
  description: "Lista contas a pagar com filtros (status, type, due).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    status: Type.Optional(Type.Union([
      Type.Literal("pending"), Type.Literal("paid"),
      Type.Literal("overdue"), Type.Literal("cancelled"),
    ])),
    type: Type.Optional(Type.Union([Type.Literal("recurring"), Type.Literal("one_time")])),
    dueWithinDays: Type.Optional(Type.Integer({ minimum: 0, maximum: 365 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const filters: string[] = ["ap.household_id = $1", "ap.deleted_at IS NULL"];
      const values: any[] = [householdId];

      if (params.status) {
        values.push(params.status);
        filters.push(`ap.status = $${values.length}`);
      }
      if (params.type) {
        values.push(params.type);
        filters.push(`ap.type = $${values.length}`);
      }
      if (params.dueWithinDays !== undefined) {
        values.push(params.dueWithinDays);
        filters.push(`ap.due_date <= (CURRENT_DATE + $${values.length} * INTERVAL '1 day')`);
      }

      const result = await pool.query<{ rows: any[] }>(
        `SELECT ap.*, a.name as account_name, c.name as category_name
         FROM accounts_payable ap
         LEFT JOIN accounts a ON a.id = ap.account_id
         LEFT JOIN categories c ON c.id = ap.category_id
         WHERE ${filters.join(" AND ")}
         ORDER BY ap.due_date ASC`,
        values
      );

      const today = new Date().toISOString().slice(0, 10);
      const items: AccountPayableWithDetails[] = result.rows.map((r) => {
        const daysUntil = Math.floor(
          (new Date(r.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          ...r,
          days_until_due: daysUntil,
          effective_status: computeEffectiveStatus(r.status, r.due_date, today),
          needs_reminder: false,
        };
      });

      return {
        success: true,
        total: items.length,
        byStatus: {
          overdue: items.filter((i) => i.effective_status === "overdue").length,
          pending: items.filter((i) => i.effective_status === "pending").length,
          paid: items.filter((i) => i.effective_status === "paid").length,
          cancelled: items.filter((i) => i.effective_status === "cancelled").length,
        },
        items: items.map((i) => ({
          id: i.id,
          description: i.description,
          amountCents: parseInt(i.amount_cents, 10),
          dueDate: i.due_date,
          type: i.type,
          frequency: i.frequency,
          status: i.effective_status,
          accountName: i.account_name,
          categoryName: i.category_name,
          daysUntilDue: i.days_until_due,
          paidDate: i.paid_date,
        })),
        message: formatAccountsList(items),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * mark_account_paid
 *
 * Marks an accounts_payable as paid AND creates a transaction (expense).
 * If recurring, the system will auto-create the next occurrence on next refresh.
 */
export const markAccountPaid: ToolDefinition = {
  name: "mark_account_paid",
  description: "Marca conta como paga e cria expense automaticamente.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    payableId: Type.String(),
    paidDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
    createTransaction: Type.Optional(Type.Boolean()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const paidDate = params.paidDate || new Date().toISOString().slice(0, 10);
      const createTx = params.createTransaction !== false;

      // Get payable
      const apResult = await pool.query<{ rows: any[] }>(
        `SELECT * FROM accounts_payable WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
        [params.payableId, householdId]
      );
      if (apResult.rows.length === 0) {
        return { success: false, error: "payable_not_found" };
      }
      const ap = apResult.rows[0];
      if (ap.status === "paid") {
        return { success: false, error: "already_paid", message: `Conta já foi paga em ${ap.paid_date}` };
      }
      if (ap.status === "cancelled") {
        return { success: false, error: "cancelled", message: "Conta cancelada, não pode ser paga" };
      }

      // Create transaction if requested
      let transactionId: string | null = null;
      if (createTx) {
        const txResult = await pool.query<{ rows: any[] }>(
          `INSERT INTO transactions
           (household_id, from_account_id, category_id, description, amount_cents,
            date, kind, status, paid_account_payable_id)
           VALUES ($1, $2, $3, $4, $5, $6::date, 'expense', 'confirmed', $7)
           RETURNING id`,
          [householdId, ap.account_id, ap.category_id, ap.description,
           ap.amount_cents, paidDate, ap.id]
        );
        transactionId = txResult.rows[0].id;
      }

      // Mark paid
      await pool.query(
        `UPDATE accounts_payable
         SET status = 'paid', paid_date = $1::date, paid_transaction_id = $2, updated_at = NOW()
         WHERE id = $3`,
        [paidDate, transactionId, params.payableId]
      );

      // If recurring, prepare next occurrence
      let nextDueDate: string | null = null;
      if (ap.type === "recurring" && ap.frequency) {
        const today = new Date().toISOString().slice(0, 10);
        nextDueDate = getNextDueDate(ap, today);

        // Create next occurrence if not already exists and end_date not passed
        const endDate = ap.end_date ? new Date(ap.end_date) : null;
        if (!endDate || endDate > new Date(today)) {
          const exists = await pool.query(
            `SELECT id FROM accounts_payable
             WHERE description = $1 AND due_date = $2::date
               AND household_id = $3 AND deleted_at IS NULL`,
            [ap.description, nextDueDate, householdId]
          );
          if (exists.rows.length === 0) {
            await pool.query(
              `INSERT INTO accounts_payable
               (household_id, account_id, category_id, description, amount_cents,
                type, frequency, due_date, end_date, reminder_days_before, source_message_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11)`,
              [
                ap.household_id, ap.account_id, ap.category_id, ap.description,
                ap.amount_cents, ap.type, ap.frequency, nextDueDate,
                ap.end_date, ap.reminder_days_before, ap.source_message_id,
              ]
            );
          }
        } else {
          nextDueDate = null;  // end_date passed
        }
      }

      return {
        success: true,
        payableId: params.payableId,
        description: ap.description,
        amountCents: parseInt(ap.amount_cents, 10),
        paidDate,
        transactionCreated: createTx,
        transactionId,
        nextDueDate,
        message: createTx
          ? `✅ ${ap.description} paga (${fmt(ap.amount_cents)}) — expense criada${nextDueDate ? `, próxima: ${nextDueDate}` : ""}`
          : `✅ ${ap.description} marcada como paga${nextDueDate ? `, próxima: ${nextDueDate}` : ""}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * cancel_account_payable
 */
export const cancelAccountPayable: ToolDefinition = {
  name: "cancel_account_payable",
  description: "Cancela uma conta a pagar (assinatura cancelada, etc).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    payableId: Type.String(),
    reason: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const result = await pool.query<{ rows: any[] }>(
        `UPDATE accounts_payable
         SET status = 'cancelled', notes = COALESCE(notes, '') || $1, updated_at = NOW()
         WHERE id = $2 AND household_id = $3 AND deleted_at IS NULL
         RETURNING id, description, amount_cents, status, due_date::text`,
        [
          params.reason ? `\n[Cancelada em ${new Date().toISOString().slice(0, 10)}] ${params.reason}` : `\n[Cancelada em ${new Date().toISOString().slice(0, 10)}]`,
          params.payableId, householdId,
        ]
      );
      if (result.rows.length === 0) {
        return { success: false, error: "not_found" };
      }
      const ap = result.rows[0];
      return {
        success: true,
        payableId: ap.id,
        description: ap.description,
        status: ap.status,
        message: `❌ Conta cancelada: ${ap.description} (${fmt(ap.amount_cents)}) — vencimento era ${ap.due_date}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * check_payable_reminders
 *
 * Returns accounts that need a reminder. Should be called at session start.
 */
export const checkPayableReminders: ToolDefinition = {
  name: "check_payable_reminders",
  description: "Retorna contas a pagar que precisam de lembrete (próximas do vencimento).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    markAsSent: Type.Optional(Type.Boolean()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const items = await getAccountsNeedingReminder(pool, householdId);

      if (params.markAsSent !== false && items.length > 0) {
        for (const item of items) {
          await markReminderSent(pool, item.id);
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const overdue = items.filter((i) => i.days_until_due < 0);
      const dueToday = items.filter((i) => i.days_until_due === 0);
      const upcoming = items.filter((i) => i.days_until_due > 0);

      const lines: string[] = [];
      if (overdue.length > 0) {
        lines.push(`🚨 ${overdue.length} VENCIDA(S):`);
        for (const i of overdue.slice(0, 5)) lines.push(`   ${formatReminder(i)}`);
        if (overdue.length > 5) lines.push(`   ... +${overdue.length - 5}`);
      }
      if (dueToday.length > 0) {
        lines.push(`🔥 ${dueToday.length} VENCE(M) HOJE:`);
        for (const i of dueToday) lines.push(`   ${formatReminder(i)}`);
      }
      if (upcoming.length > 0) {
        lines.push(`📅 ${upcoming.length} próxima(s):`);
        for (const i of upcoming.slice(0, 5)) lines.push(`   ${formatReminder(i)}`);
        if (upcoming.length > 5) lines.push(`   ... +${upcoming.length - 5}`);
      }
      if (lines.length === 0) {
        lines.push("✅ Nenhuma conta a pagar precisa de lembrete agora");
      }

      return {
        success: true,
        hasUrgent: overdue.length > 0 || dueToday.length > 0,
        counts: {
          overdue: overdue.length,
          dueToday: dueToday.length,
          upcoming: upcoming.length,
        },
        items: items.map((i) => ({
          id: i.id,
          description: i.description,
          amountCents: parseInt(i.amount_cents, 10),
          dueDate: i.due_date,
          daysUntilDue: i.days_until_due,
          status: i.effective_status,
          accountName: i.account_name,
        })),
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * refresh_payable_status
 *
 * Updates all statuses: pending → overdue if date passed.
 * Also creates next occurrence for recurring paid accounts.
 */
export const refreshPayableStatus: ToolDefinition = {
  name: "refresh_payable_status",
  description: "Atualiza status de todas as contas (pending→overdue, recurring→próxima).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const result = await refreshAccountsPayable(pool, householdId);

      return {
        success: true,
        updatedToOverdue: result.updated,
        nextOccurrencesCreated: result.created.length,
        created: result.created,
        message: `🔄 Status atualizado: ${result.updated} virou overdue${result.created.length > 0 ? `, ${result.created.length} próxima(s) ocorrência(s) criada(s)` : ""}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
