/**
 * get_statement_details — Get detailed info for a single statement
 *
 * Returns statement + all purchases + formatted text.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import { formatStatement, getStatementPurchases, refreshStatementStatus } from "./credit-card";

interface Params {
  householdId: string;
  statementId: string;
}

const schema = Type.Object({
  householdId: Type.String(),
  statementId: Type.String(),
});

export const getStatementDetails: ToolDefinition = {
  name: "get_statement_details",
  description: "Mostra detalhes de uma fatura: total, pago, saldo e lista de compras.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // Refresh status first
      const today = new Date().toISOString().slice(0, 10);
      await refreshStatementStatus(pool, params.statementId, today);

      const result = await pool.query<{ rows: Array<{
        id: string;
        account_id: string;
        cycle_year_month: string;
        closing_date: string;
        due_date: string;
        total_cents: string;
        paid_cents: string;
        status: string;
      }> }>(
        `SELECT id, account_id, cycle_year_month,
                closing_date::text, due_date::text,
                total_cents, paid_cents, status
         FROM statements
         WHERE id = $1 AND household_id = $2`,
        [params.statementId, params.householdId]
      );

      if (result.rows.length === 0) {
        return { success: false, error: "statement_not_found" };
      }

      const s = result.rows[0];
      const accResult = await pool.query<{ rows: Array<{ name: string }> }>(
        `SELECT name FROM accounts WHERE id = $1`,
        [s.account_id]
      );
      const accName = accResult.rows[0]?.name || "Desconhecido";

      const purchases = await getStatementPurchases(pool, params.statementId);

      const statement = {
        id: s.id,
        accountId: s.account_id,
        accountName: accName,
        cycleYearMonth: s.cycle_year_month,
        closingDate: s.closing_date,
        dueDate: s.due_date,
        totalCents: parseInt(s.total_cents, 10),
        paidCents: parseInt(s.paid_cents, 10),
        remaining: parseInt(s.total_cents, 10) - parseInt(s.paid_cents, 10),
        status: s.status,
        purchases,
      };

      return {
        success: true,
        statement,
        message: formatStatement(statement as any, purchases),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
