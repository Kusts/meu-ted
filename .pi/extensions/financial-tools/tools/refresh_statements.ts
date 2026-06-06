/**
 * refresh_statements — Periodic statement status refresh
 *
 * Should be called:
 * - At the start of each TED session (user says oi, etc.)
 * - After any purchase/payment
 * - On a daily cron
 *
 * Returns any status changes (open → closed → overdue, etc.)
 * and a list of statements closing soon (proactive).
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  refreshAllStatements,
  getStatementsClosingSoon,
  formatChanges,
} from "./statement-automation";

interface Params {
  householdId: string;
  date?: string;
}

const schema = Type.Object({
  householdId: Type.String(),
  date: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
});

export const refreshStatements: ToolDefinition = {
  name: "refresh_statements",
  description:
    "Atualiza status de todas as faturas (open→closed, closed→overdue, etc). Retorna mudanças e faturas próximas de fechar.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const today = params.date || new Date().toISOString().slice(0, 10);

      // 1. Refresh all statements
      const result = await refreshAllStatements(pool, params.householdId, today);

      // 2. Find statements closing soon (next 5 days)
      const closingSoon = await getStatementsClosingSoon(pool, params.householdId, today, 5);

      // 3. Build response
      const message = formatChanges(result);

      let extra = "";
      if (closingSoon.length > 0) {
        extra = "\n\n📅 Fechando em breve:\n";
        for (const s of closingSoon) {
          extra += `  • ${s.accountName} ${s.cycle}: fecha em ${s.daysUntilClose} dia(s) — R$ ${(s.totalCents / 100).toFixed(2)}\n`;
        }
      }

      return {
        success: true,
        ...result,
        closingSoon,
        message: message + extra,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
