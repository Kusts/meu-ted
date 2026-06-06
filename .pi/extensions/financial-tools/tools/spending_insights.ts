/**
 * spending_insights — Compare spending vs history, detect anomalies
 *
 * Returns:
 * - Category comparisons (current vs 3-month average)
 * - Anomalies (unusually large transactions)
 * - Income share (% of income each category consumes)
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  compareToAverage,
  detectAnomalies,
  getCategoryShareOfIncome,
  formatSpendingAnalysis,
  type SpendingInsight,
  type CategoryComparison,
} from "./spending-analysis";

interface Params {
  householdId: string;
  yearMonth?: string;  // defaults to current
  insightType?: "all" | "comparison" | "anomalies" | "income-share";
  lookbackMonths?: number;  // default 3
}

const schema = Type.Object({
  householdId: Type.String(),
  yearMonth: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}$" })),
  insightType: Type.Optional(
    Type.Union([
      Type.Literal("all"),
      Type.Literal("comparison"),
      Type.Literal("anomalies"),
      Type.Literal("income-share"),
    ])
  ),
  lookbackMonths: Type.Optional(Type.Integer({ minimum: 1, maximum: 12 })),
});

export const spendingInsights: ToolDefinition = {
  name: "spending_insights",
  description: "Analisa gastos comparando com média histórica, detecta anomalias e mostra % da renda por categoria.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const now = new Date();
      const yearMonth =
        params.yearMonth ||
        `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const insightType = params.insightType || "all";
      const lookback = params.lookbackMonths || 3;

      const result: any = { success: true, yearMonth };
      const allInsights: SpendingInsight[] = [];

      if (insightType === "all" || insightType === "comparison") {
        const { comparisons, insights } = await compareToAverage(pool, params.householdId, yearMonth, lookback);
        result.comparisons = comparisons;
        allInsights.push(...insights);
      }

      if (insightType === "all" || insightType === "anomalies") {
        const anomalies = await detectAnomalies(pool, params.householdId, yearMonth);
        result.anomalies = anomalies;
        allInsights.push(...anomalies);
      }

      if (insightType === "all" || insightType === "income-share") {
        const share = await getCategoryShareOfIncome(pool, params.householdId, yearMonth);
        result.incomeShare = share;
      }

      if (insightType === "all") {
        const comparisons = result.comparisons || [];
        result.message = formatSpendingAnalysis(comparisons, allInsights);
        if (result.incomeShare && result.incomeShare.length > 0) {
          result.message += "\n\n💰 % da renda por categoria:\n";
          for (const s of result.incomeShare.slice(0, 5)) {
            result.message += `  • ${s.category}: ${s.sharePercent}% (R$ ${(s.totalCents / 100).toFixed(2)})\n`;
          }
        }
      } else {
        result.message = allInsights.length > 0
          ? allInsights.map((i) => i.message).join("\n")
          : "Sem insights para este tipo";
      }

      return result;
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
