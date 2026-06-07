/**
 * payable_templates — Tools para templates de contas recorrentes
 *
 * 4 tools:
 * - create_payable_template: salva template (Netflix sempre dia 15)
 * - create_payable_from_template: cria conta a pagar a partir de template
 * - list_payable_templates: lista templates ativos
 * - auto_create_from_templates: cria N contas a partir de templates (batch)
 *
 * Uso típico:
 *   1. Salvar: "todo dia 10 tenho conta de luz de R$ 185"
 *   2. Criar: "cria a conta de luz desse mês"
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import { addMonths } from "./installment-plan.js";
import { autoCategorize } from "./categorizer.js";
import { createAccountPayable } from "./accounts_payable.js";

const HOUSEHOLD_DEFAULT = process.env.HOUSEHOLD_ID || "550e8400-e29b-41d4-a716-446655440000";
const fmt = (cents: number | string) => `R$ ${(typeof cents === "string" ? parseInt(cents, 10) : cents) / 100}`;

/**
 * Calculate next due date for a template based on day_of_month.
 * Returns YYYY-MM-DD string.
 */
export function calculateTemplateNextDue(dayOfMonth: number, today: string): string {
  const t = new Date(today);
  let year = t.getFullYear();
  let month = t.getMonth();  // 0-indexed

  // First try this month
  let candidate = new Date(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));
  if (candidate < t) {
    // Move to next month
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    candidate = new Date(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));
  }
  return candidate.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export const createPayableTemplate: ToolDefinition = {
  name: "create_payable_template",
  description: "Salva um template de conta recorrente (ex: Netflix todo dia 15).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    accountId: Type.String(),
    name: Type.String(),  // ex: "Netflix"
    description: Type.String(),  // ex: "Mensalidade Netflix"
    amountCents: Type.Number({ minimum: 1 }),
    frequency: Type.Union([Type.Literal("monthly"), Type.Literal("quarterly"), Type.Literal("yearly")]),
    dayOfMonth: Type.Integer({ minimum: 1, maximum: 31 }),
    reminderDaysBefore: Type.Optional(Type.Integer({ minimum: 0, maximum: 30 })),
    notes: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;

      // Auto-categorize
      const catResult = await autoCategorize(pool, householdId, params.description, "expense");
      const categoryId = catResult?.id || null;

      // Check if template with same name already exists
      const exists = await pool.query(
        `SELECT id FROM account_payable_templates
         WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND active = true`,
        [householdId, params.name]
      );
      if (exists.rows.length > 0) {
        return {
          success: false,
          error: "template_exists",
          message: `Já existe template "${params.name}"`,
          existingId: exists.rows[0].id,
        };
      }

      const result = await pool.query<{ rows: any[] }>(
        `INSERT INTO account_payable_templates
         (household_id, account_id, category_id, name, description, amount_cents,
          frequency, day_of_month, reminder_days_before, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, name, day_of_month, amount_cents, frequency, created_at`,
        [
          householdId, params.accountId, categoryId, params.name, params.description,
          params.amountCents, params.frequency, params.dayOfMonth,
          params.reminderDaysBefore ?? 3, params.notes || null,
        ]
      );
      const t = result.rows[0];

      // Auto-create first occurrence if next due is in the future
      const today = new Date().toISOString().slice(0, 10);
      const nextDue = calculateTemplateNextDue(t.day_of_month, today);

      let firstPayableId: string | null = null;
      if (nextDue >= today) {
        const createResult = await createAccountPayable.execute({
          householdId,
          accountId: params.accountId,
          description: params.description,
          amountCents: params.amountCents,
          dueDate: nextDue,
          type: "recurring",
          frequency: params.frequency,
          reminderDaysBefore: params.reminderDaysBefore ?? 3,
        } as any);
        if (createResult.success) {
          firstPayableId = createResult.payableId;
        }
      }

      return {
        success: true,
        templateId: t.id,
        name: t.name,
        amountCents: parseInt(t.amount_cents, 10),
        frequency: t.frequency,
        dayOfMonth: t.day_of_month,
        nextDue,
        firstPayableId,
        message: `✅ Template "${params.name}" salvo — próximo vencimento: ${nextDue}${firstPayableId ? " (conta já criada)" : ""}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

export const createPayableFromTemplate: ToolDefinition = {
  name: "create_payable_from_template",
  description: "Cria uma conta a pagar a partir de um template salvo.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    templateId: Type.Optional(Type.String()),
    templateName: Type.Optional(Type.String()),
    dueDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),  // default: próximo calculado
    amountOverrideCents: Type.Optional(Type.Number({ minimum: 1 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;

      // Find template
      let template: any;
      if (params.templateId) {
        const r = await pool.query(
          `SELECT * FROM account_payable_templates WHERE id = $1 AND household_id = $2 AND active = true`,
          [params.templateId, householdId]
        );
        if (r.rows.length === 0) {
          return { success: false, error: "template_not_found" };
        }
        template = r.rows[0];
      } else if (params.templateName) {
        const r = await pool.query(
          `SELECT * FROM account_payable_templates
           WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND active = true`,
          [householdId, params.templateName]
        );
        if (r.rows.length === 0) {
          return {
            success: false,
            error: "template_not_found",
            message: `Nenhum template "${params.templateName}" encontrado`,
          };
        }
        template = r.rows[0];
      } else {
        return { success: false, error: "missing_id_or_name" };
      }

      // Calculate due date
      const today = new Date().toISOString().slice(0, 10);
      const dueDate = params.dueDate || calculateTemplateNextDue(template.day_of_month, today);

      // Check for duplicates (same template name + due_date)
      const dup = await pool.query(
        `SELECT id FROM accounts_payable
         WHERE description = $1 AND due_date = $2::date
           AND household_id = $3 AND deleted_at IS NULL`,
        [template.description, dueDate, householdId]
      );
      if (dup.rows.length > 0) {
        return {
          success: false,
          error: "duplicate",
          message: `Já existe conta "${template.description}" para ${dueDate}`,
          existingId: dup.rows[0].id,
        };
      }

      // Create the payable
      const createResult = await createAccountPayable.execute({
        householdId,
        accountId: template.account_id,
        description: template.description,
        amountCents: params.amountOverrideCents || parseInt(template.amount_cents, 10),
        dueDate,
        type: "recurring",
        frequency: template.frequency,
        reminderDaysBefore: template.reminder_days_before,
      } as any);

      if (!createResult.success) {
        return createResult;
      }

      // Update last_used_date
      await pool.query(
        `UPDATE account_payable_templates
         SET last_used_date = $1, updated_at = NOW()
         WHERE id = $2`,
        [today, template.id]
      );

      return {
        success: true,
        templateId: template.id,
        templateName: template.name,
        payableId: createResult.payableId,
        description: template.description,
        amountCents: createResult.amountCents,
        dueDate,
        message: `✅ Conta "${template.name}" criada (${fmt(createResult.amountCents)}) — vence ${dueDate}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

export const listPayableTemplates: ToolDefinition = {
  name: "list_payable_templates",
  description: "Lista templates de contas a pagar.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    activeOnly: Type.Optional(Type.Boolean()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const filter = params.activeOnly === false ? "" : "AND t.active = true";

      const result = await pool.query<{ rows: any[] }>(
        `SELECT t.id, t.name, t.description, t.amount_cents, t.frequency,
                t.day_of_month, t.last_used_date, t.active,
                a.name as account_name, c.name as category_name
         FROM account_payable_templates t
         LEFT JOIN accounts a ON a.id = t.account_id
         LEFT JOIN categories c ON c.id = t.category_id
         WHERE t.household_id = $1 ${filter}
         ORDER BY t.day_of_month, t.name`,
        [householdId]
      );

      const today = new Date().toISOString().slice(0, 10);
      const items = result.rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        amountCents: parseInt(r.amount_cents, 10),
        frequency: r.frequency,
        dayOfMonth: r.day_of_month,
        nextDue: calculateTemplateNextDue(r.day_of_month, today),
        lastUsedDate: r.last_used_date,
        accountName: r.account_name,
        categoryName: r.category_name,
        active: r.active,
      }));

      const lines: string[] = [];
      lines.push(`📋 ${items.length} template(s) de contas a pagar:\n`);
      for (const i of items) {
        const status = i.active ? "✅" : "⏸️";
        const freqLabel: Record<string, string> = {
          monthly: "mensal", quarterly: "trimestral", yearly: "anual",
        };
        lines.push(`${status} ${i.name} (${freqLabel[i.frequency]} — dia ${i.dayOfMonth})`);
        lines.push(`   ${fmt(i.amountCents)} — próxima: ${i.nextDue} | conta: ${i.accountName}`);
      }

      return {
        success: true,
        total: items.length,
        items,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

export const autoCreateFromTemplates: ToolDefinition = {
  name: "auto_create_from_templates",
  description: "Cria contas automaticamente a partir de templates ativos (batch).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    daysAhead: Type.Optional(Type.Integer({ minimum: 0, maximum: 90 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const daysAhead = params.daysAhead ?? 30;
      const today = new Date().toISOString().slice(0, 10);
      const future = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);

      const templates = await pool.query<{ rows: any[] }>(
        `SELECT * FROM account_payable_templates
         WHERE household_id = $1 AND active = true`,
        [householdId]
      );

      const created: any[] = [];
      const skipped: any[] = [];

      for (const t of templates.rows) {
        const nextDue = calculateTemplateNextDue(t.day_of_month, today);
        if (nextDue > future) continue;  // outside window

        // Check if already exists
        const exists = await pool.query(
          `SELECT id FROM accounts_payable
           WHERE description = $1 AND due_date = $2::date
             AND household_id = $3 AND deleted_at IS NULL`,
          [t.description, nextDue, householdId]
        );
        if (exists.rows.length > 0) {
          skipped.push({ name: t.name, dueDate: nextDue, reason: "já existe" });
          continue;
        }

        const result = await createAccountPayable.execute({
          householdId,
          accountId: t.account_id,
          description: t.description,
          amountCents: parseInt(t.amount_cents, 10),
          dueDate: nextDue,
          type: "recurring",
          frequency: t.frequency,
          reminderDaysBefore: t.reminder_days_before,
        } as any);

        if (result.success) {
          created.push({
            templateId: t.id,
            name: t.name,
            payableId: result.payableId,
            dueDate: nextDue,
            amountCents: parseInt(t.amount_cents, 10),
          });
        } else {
          skipped.push({ name: t.name, dueDate: nextDue, reason: result.error });
        }
      }

      return {
        success: true,
        createdCount: created.length,
        skippedCount: skipped.length,
        created,
        skipped,
        message: `🔄 ${created.length} conta(s) criada(s) automaticamente${skipped.length > 0 ? `, ${skipped.length} ignorada(s)` : ""}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
