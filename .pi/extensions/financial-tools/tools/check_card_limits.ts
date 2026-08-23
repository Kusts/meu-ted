/**
 * check_card_limits â€” Check credit card limit usage
 *
 * Returns usage status for all credit cards in a household.
 * Warns at 80%+ usage, alerts at 100%+.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Pool } from "pg";
import {
  getAllLimitStatuses,
  getLimitStatus,
  formatLimitStatus,
  type LimitStatus,
} from "./limit-guard";

interface Params {
  householdId: string;
  accountId?: string;  // specific card, or all
  date?: string;  // defaults to today
}

const schema = Type.Object({
  householdId: Type.String(),
  accountId: Type.Optional(Type.String()),
  date: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
});

export const checkCardLimits: ToolDefinition = {
  name: "check_card_limits",
  description: "Verifica uso do limite dos cartÃµes de crÃ©dito. Alerta quando uso > 80% ou > 100%.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const today = params.date || new Date().toISOString().slice(0, 10);
      let statuses: LimitStatus[];

      if (params.accountId) {
        const s = await getLimitStatus(pool, params.accountId, today);
        statuses = s ? [s] : [];
      } else {
        statuses = await getAllLimitStatuses(pool, params.householdId, today);
      }

      if (statuses.length === 0) {
        return {
          success: true,
          statuses: [],
          message: "Nenhum cartÃ£o de crÃ©dito encontrado",
        };
      }

      // Aggregate warnings
      const caution = statuses.filter((s) => s.status === "caution");
      const warning = statuses.filter((s) => s.status === "warning");
      const overLimit = statuses.filter((s) => s.status === "over_limit");
      const hasAlerts = caution.length + warning.length + overLimit.length > 0;

      // Format each
      const formatted = statuses.map(formatLimitStatus);

      let summary = `ðŸ“Š Limite de ${statuses.length} cartÃ£o(Ãµes):\n\n`;
      summary += formatted.join("\n\n");

      if (hasAlerts) {
        const alerts: string[] = [];
        if (overLimit.length > 0) {
          alerts.push(`ðŸš¨ ${overLimit.length} cartÃ£o(Ãµes) ACIMA do limite`);
        }
        if (warning.length > 0) {
          alerts.push(`ðŸ”´ ${warning.length} cartÃ£o(Ãµes) com uso > 90%`);
        }
        if (caution.length > 0) {
          alerts.push(`âš ï¸ ${caution.length} cartÃ£o(Ãµes) com uso > 80%`);
        }
        summary = alerts.join("\n") + "\n\n" + summary;
      }

      return {
        success: true,
        statuses,
        alerts: {
          caution: caution.length,
          warning: warning.length,
          overLimit: overLimit.length,
        },
        message: summary,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
