/**
 * list_statements — List statements for a credit card
 *
 * Filter by: accountId (optional), status (optional), overdueOnly (optional)
 * Returns formatted statements with totals and purchase counts.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import { formatStatement, getStatementPurchases, type Statement } from "./credit-card";

interface Params {
  householdId: string;
  accountId?: string;
  status?: "open" | "closed" | "paid" | "partial" | "overdue" | "cancelled";
  overdueOnly?: boolean;
  limit?: number;
}

const schema = Type.Object({
  householdId: Type.String(),
  accountId: Type.Optional(Type.String()),
  status: Type.Optional(
    Type.Union([
      Type.Literal("open"),
      Type.Literal("closed"),
      Type.Literal("paid"),
      Type.Literal("partial"),
      Type.Literal("overdue"),
      Type.Literal("cancelled"),
    ])
  ),
  overdueOnly: Type.Optional(Type.Boolean()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
});

export const listStatements: ToolDefinition = {
  name: "list_statements",
  description: "Lista faturas de cartão de crédito. Pode filtrar por conta, status, ou só atrasadas.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const conditions: string[] = ["household_id = $1"];
      const queryParams: any[] = [params.householdId];

      if (params.accountId) {
        conditions.push(`account_id = $${queryParams.length + 1}`);
        queryParams.push(params.accountId);
      }
      if (params.status) {
        conditions.push(`status = $${queryParams.length + 1}`);
        queryParams.push(params.status);
      }
      if (params.overdueOnly) {
        conditions.push(`status = 'overdue'`);
      }

      const limit = params.limit || 12;
      const result = await pool.query<{ rows: Statement[] }>(
        `SELECT id, account_id as "accountId", cycle_year_month as "cycleYearMonth",
                closing_date::text as "closingDate", due_date::text as "dueDate",
                total_cents as "totalCents", paid_cents as "paidCents", status
         FROM statements
         WHERE ${conditions.join(" AND ")}
         ORDER BY closing_date DESC
         LIMIT ${limit}`,
        queryParams
      );

      if (result.rows.length === 0) {
        return {
          success: true,
          statements: [],
          message: "Nenhuma fatura encontrada",
        };
      }

      // Get account names
      const accResult = await pool.query<{ rows: Array<{ id: string; name: string }> }>(
        `SELECT id, name FROM accounts WHERE id = ANY($1::uuid[])`,
        [result.rows.map((s) => s.accountId)]
      );
      const accMap = new Map(accResult.rows.map((a) => [a.id, a.name]));

      // Get purchase counts
      const enriched = await Promise.all(
        result.rows.map(async (s) => {
          const purchases = await getStatementPurchases(pool, s.id);
          return {
            ...s,
            accountName: accMap.get(s.accountId) || "Desconhecido",
            purchaseCount: purchases.length,
            remaining: s.totalCents - s.paidCents,
          };
        })
      );

      // Format summary
      const totalPending = enriched
        .filter((s) => s.status !== "paid" && s.status !== "cancelled")
        .reduce((sum, s) => sum + s.remaining, 0);
      const totalOverdue = enriched
        .filter((s) => s.status === "overdue")
        .reduce((sum, s) => sum + s.remaining, 0);

      const header =
        enriched.length === 0
          ? "Nenhuma fatura encontrada"
          : `📋 ${enriched.length} fatura(s) | Pendente: R$ ${(totalPending / 100).toFixed(2)} | Atrasado: R$ ${(totalOverdue / 100).toFixed(2)}`;

      return {
        success: true,
        statements: enriched,
        summary: {
          count: enriched.length,
          totalPendingCents: totalPending,
          totalOverdueCents: totalOverdue,
        },
        message: header,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
