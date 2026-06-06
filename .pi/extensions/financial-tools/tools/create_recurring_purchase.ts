/**
 * create_recurring_purchase — Create a recurring (subscription) purchase
 *
 * Auto-posts to the account on the next_due_date.
 * TED (or a cron) should call post_due_recurring() periodically.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  computeNextDueDate,
  getDueRecurringPurchases,
  markRecurringPosted,
  getMonthlyRecurringTotal,
  formatRecurringList,
  type RecurringPurchase,
} from "./recurring-purchase";
import { autoCategorize } from "./categorizer";

interface Params {
  householdId: string;
  accountId: string;
  description: string;
  amountCents: number;
  frequency: "monthly" | "quarterly" | "yearly";
  startDate: string;
  endDate?: string;
  categoryId?: string;
  sourceMessageId?: string;
}

const schema = Type.Object({
  householdId: Type.String(),
  accountId: Type.String(),
  description: Type.String({ minLength: 1 }),
  amountCents: Type.Integer({ minimum: 1 }),
  frequency: Type.Union([Type.Literal("monthly"), Type.Literal("quarterly"), Type.Literal("yearly")]),
  startDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  endDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
  categoryId: Type.Optional(Type.String()),
  sourceMessageId: Type.Optional(Type.String()),
});

export const createRecurringPurchase: ToolDefinition = {
  name: "create_recurring_purchase",
  description: "Cria uma assinatura ou compra recorrente (mensal, trimestral ou anual).",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // Auto-categorize
      let categoryId = params.categoryId;
      let categoryInfo: any = null;
      if (!categoryId) {
        const cat = await autoCategorize(pool, params.householdId, params.description, "expense");
        if (cat) {
          categoryId = cat.id;
          categoryInfo = cat.match;
        }
      }

      // First due date = startDate
      const result = await pool.query<{ rows: Array<{ id: string }> }>(
        `INSERT INTO recurring_purchases (
          id, household_id, account_id, category_id, description, amount_cents,
          frequency, start_date, end_date, next_due_date, status,
          source_message_id, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          $6, $7, $8, $7, 'active',
          $9, NOW(), NOW()
        )
        RETURNING id`,
        [
          params.householdId,
          params.accountId,
          categoryId,
          params.description,
          params.amountCents,
          params.frequency,
          params.startDate,
          params.endDate || null,
          params.sourceMessageId || null,
        ]
      );

      const id = result.rows[0].id;
      const response: any = {
        success: true,
        id,
        description: params.description,
        amountCents: params.amountCents,
        frequency: params.frequency,
        firstDueDate: params.startDate,
        message: `🔁 Recorrência criada: ${params.description} — R$ ${(params.amountCents / 100).toFixed(2)} ${params.frequency === "monthly" ? "/mês" : params.frequency === "quarterly" ? "/trimestre" : "/ano"}`,
      };
      if (categoryInfo) {
        response.category = categoryInfo.fullName;
        response.confidence = Math.round(categoryInfo.confidence * 100);
      }
      return response;
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * post_due_recurring — Post all due recurring purchases
 */
export const postDueRecurring: ToolDefinition = {
  name: "post_due_recurring",
  description: "Posta todas as recorrências devidas (cria transactions para hoje).",
  parameters: Type.Object({
    householdId: Type.String(),
    date: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
  }),
  execute: async (params: { householdId: string; date?: string }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const today = params.date || new Date().toISOString().slice(0, 10);
      const due = await getDueRecurringPurchases(pool, params.householdId, today);

      if (due.length === 0) {
        return { success: true, posted: 0, message: "Nenhuma recorrência devida" };
      }

      const posted: any[] = [];
      for (const rp of due) {
        // Create transaction
        const txResult = await pool.query<{ rows: Array<{ id: string }> }>(
          `INSERT INTO transactions (
            id, household_id, from_account_id, description, amount_cents, date,
            kind, category_id, is_recurring, recurring_purchase_id,
            idempotency_key, created_at
          )
          VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5,
            'expense', $6, true, $7,
            $8, NOW()
          )
          RETURNING id`,
          [
            rp.householdId,
            rp.accountId,
            rp.description,
            rp.amountCents,
            today,
            rp.categoryId,
            rp.id,
            `recurring-${rp.id}-${today}`,
          ]
        );
        await markRecurringPosted(pool, rp.id, today);
        posted.push({
          description: rp.description,
          amountCents: typeof rp.amountCents === "string" ? parseInt(rp.amountCents, 10) : rp.amountCents,
          transactionId: txResult.rows[0].id,
        });
      }

      const totalCents = posted.reduce((s, p) => s + p.amountCents, 0);
      return {
        success: true,
        posted: posted.length,
        totalCents,
        items: posted,
        message: `🔁 ${posted.length} recorrência(s) postada(s) totalizando R$ ${(totalCents / 100).toFixed(2)}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * list_recurring_purchases
 */
export const listRecurringPurchases: ToolDefinition = {
  name: "list_recurring_purchases",
  description: "Lista todas as recorrências ativas, com total mensal estimado.",
  parameters: Type.Object({
    householdId: Type.String(),
    status: Type.Optional(Type.Union([Type.Literal("active"), Type.Literal("paused"), Type.Literal("cancelled")])),
  }),
  execute: async (params: { householdId: string; status?: "active" | "paused" | "cancelled" }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const conditions = ["household_id = $1"];
      const queryParams: any[] = [params.householdId];
      if (params.status) {
        conditions.push(`status = $${queryParams.length + 1}`);
        queryParams.push(params.status);
      }
      const result = await pool.query<{ rows: any[] }>(
        `SELECT id, household_id as "householdId", account_id as "accountId",
                category_id as "categoryId", description, amount_cents as "amountCents",
                frequency, start_date::text as "startDate",
                end_date::text as "endDate", last_posted_date::text as "lastPostedDate",
                next_due_date::text as "nextDueDate", status,
                source_message_id as "sourceMessageId", created_at::text as "createdAt"
         FROM recurring_purchases
         WHERE ${conditions.join(" AND ")}
         ORDER BY amount_cents DESC`,
        queryParams
      );

      const monthlyTotal = await getMonthlyRecurringTotal(pool, params.householdId);
      const list = result.rows;

      return {
        success: true,
        recurring: list,
        monthlyTotalCents: monthlyTotal,
        count: list.length,
        message: formatRecurringList(list) + `\n\n💰 Total mensal estimado: R$ ${(monthlyTotal / 100).toFixed(2)}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
