/**
 * card_insights — Generate insights for credit card usage
 *
 * - month-over-month comparison
 * - top categories per card
 * - card vs other payment methods
 * - overdue alerts
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  getMonthOverMonthInsights,
  getTopCategoriesByCard,
  getCardVsOtherPayment,
  getTotalOverdue,
  formatInsights,
  formatTopCategories,
} from "./card-insights";

interface Params {
  householdId: string;
  yearMonth?: string;  // defaults to current month
  insightType?: "all" | "month-over-month" | "top-categories" | "card-vs-other" | "overdue";
}

const schema = Type.Object({
  householdId: Type.String(),
  yearMonth: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}$" })),
  insightType: Type.Optional(
    Type.Union([
      Type.Literal("all"),
      Type.Literal("month-over-month"),
      Type.Literal("top-categories"),
      Type.Literal("card-vs-other"),
      Type.Literal("overdue"),
    ])
  ),
});

export const cardInsights: ToolDefinition = {
  name: "card_insights",
  description: "Gera insights sobre uso de cartão de crédito: comparação mês a mês, top categorias, etc.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const now = new Date();
      const yearMonth =
        params.yearMonth ||
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const insightType = params.insightType || "all";
      const result: any = { success: true, yearMonth };

      if (insightType === "all" || insightType === "overdue") {
        const overdue = await getTotalOverdue(pool, params.householdId);
        result.overdue = overdue;
        if (overdue.count > 0) {
          result.warnings = result.warnings || [];
          result.warnings.push(
            `⚠️ ${overdue.count} fatura(s) atrasada(s) totalizando R$ ${(overdue.totalCents / 100).toFixed(2)}`
          );
        }
      }

      if (insightType === "all" || insightType === "month-over-month") {
        const mom = await getMonthOverMonthInsights(pool, params.householdId, yearMonth);
        result.monthOverMonth = mom;
        if (mom.length > 0) {
          result.messages = result.messages || [];
          result.messages.push(formatInsights(mom));
        }
      }

      if (insightType === "all" || insightType === "top-categories") {
        const top = await getTopCategoriesByCard(pool, params.householdId, yearMonth, 5);
        result.topCategories = top;
        if (top.length > 0) {
          result.messages = result.messages || [];
          result.messages.push(formatTopCategories(top));
        }
      }

      if (insightType === "all" || insightType === "card-vs-other") {
        const cvp = await getCardVsOtherPayment(pool, params.householdId, yearMonth);
        result.cardVsOther = cvp;
        result.messages = result.messages || [];
        result.messages.push(
          `💳 vs 💵: Cartão R$ ${(cvp.cardTotalCents / 100).toFixed(2)} (${cvp.cardPercent}%) | Outros R$ ${(cvp.otherTotalCents / 100).toFixed(2)}`
        );
      }

      if (result.messages && result.messages.length > 0) {
        result.message = result.messages.join("\n\n");
        if (result.warnings) {
          result.message = result.warnings.join("\n") + "\n\n" + result.message;
        }
      } else if (!result.warnings) {
        result.message = "Sem dados para gerar insights";
      } else {
        result.message = result.warnings.join("\n");
      }

      return result;
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
