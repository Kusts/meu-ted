/**
 * payment_score — Score de pontualidade nos pagamentos
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import { computePaymentScore, formatPaymentScore } from "./payment-score";

export const paymentScore: ToolDefinition = {
  name: "payment_score",
  description: "Calcula score de pontualidade nos pagamentos (últimos N meses).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    monthsBack: Type.Optional(Type.Integer({ minimum: 1, maximum: 24 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const score = await computePaymentScore(pool, params.householdId || "550e8400-e29b-41d4-a716-446655440000",
        params.monthsBack || 6);
      return {
        success: true,
        ...score,
        message: formatPaymentScore(score),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
