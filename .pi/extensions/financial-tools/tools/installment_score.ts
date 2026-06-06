/**
 * installment_score — Financial health score based on installment usage
 *
 * Returns a score (0-100) with rating, breakdown, and recommendations.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import { computeInstallmentScore, formatScore } from "./installment-score";

const schema = Type.Object({
  householdId: Type.String(),
});

export const installmentScore: ToolDefinition = {
  name: "installment_score",
  description: "Calcula score de saúde financeira baseado em parcelamentos (0-100).",
  parameters: schema,
  execute: async (params: { householdId: string }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const score = await computeInstallmentScore(pool, params.householdId);
      return {
        success: true,
        ...score,
        message: formatScore(score),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
