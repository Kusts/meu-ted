/**
 * prepay_installments â€” AntecipaÃ§Ã£o de parcelas (com ou sem desconto)
 *
 * Paga N parcelas restantes antecipadamente. Suporta:
 * - Pagamento total: quita todas as restantes
 * - Pagamento parcial: quita apenas as prÃ³ximas N
 * - Com desconto: aplica desconto sobre o valor presente das parcelas
 *
 * Apenas para planos out_of_card (cartÃ£o Ã© gerenciado via statement).
 *
 * CÃ¡lculo de desconto:
 * - Sem juros: valor cheio
 * - Com juros: desconto baseado no valor presente das parcelas restantes
 *   (PV = PMT * (1 - (1+i)^-n) / i)
 *   Exemplo: 12x de R$ 100 a 2% a.m., faltam 6 â†’ PV â‰ˆ R$ 558
 *   (vs R$ 600 sem desconto, desconto de R$ 42 = 7%)
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Pool } from "pg";

interface Params {
  householdId: string;
  planId: string;
  numberOfInstallments: number;  // quantas parcelas antecipar (1 = prÃ³xima, N = todas)
  discountRate?: number;  // 0 to 1, ex: 0.05 = 5% de desconto
  discountType?: "simple" | "present_value";  // simple = X% off, present_value = recalcula com base no VP
  paidDate?: string;
}

const schema = Type.Object({
  householdId: Type.String(),
  planId: Type.String(),
  numberOfInstallments: Type.Integer({ minimum: 1, maximum: 60 }),
  discountRate: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  discountType: Type.Optional(Type.Union([Type.Literal("simple"), Type.Literal("present_value")])),
  paidDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
});

/**
 * Calculate present value of remaining installments.
 * PV = PMT * (1 - (1+i)^-n) / i
 * If i = 0, PV = PMT * n
 */
function calculatePresentValue(pmt: number, rate: number, n: number): number {
  if (rate === 0) return pmt * n;
  return pmt * (1 - Math.pow(1 + rate, -n)) / rate;
}

export const prepayInstallments: ToolDefinition = {
  name: "prepay_installments",
  description: "Antecipa N parcelas restantes de um plano fora do cartÃ£o. Suporta desconto.",
  parameters: schema,
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      // 1. Get plan
      const planResult = await pool.query<any>(
        `SELECT id, description, total_amount_cents, installments_count, interest_rate, type
         FROM installment_plans
         WHERE id = $1 AND household_id = $2`,
        [params.planId, params.householdId]
      );
      if (planResult.rows.length === 0) {
        return { success: false, error: "plan_not_found" };
      }
      const plan = planResult.rows[0];
      if (plan.type !== "out_of_card") {
        return {
          success: false,
          error: "not_out_of_card",
          message: "AntecipaÃ§Ã£o sÃ³ funciona para planos fora do cartÃ£o. Use pay_statement para cartÃ£o.",
        };
      }

      // 2. Get scheduled installments (oldest first)
      const txResult = await pool.query<any>(
        `SELECT id, installment_number, amount_cents, date::text, installment_status
         FROM transactions
         WHERE installment_plan_id = $1
           AND installment_status = 'scheduled'
           AND deleted_at IS NULL
         ORDER BY installment_number ASC
         LIMIT $2`,
        [params.planId, params.numberOfInstallments]
      );
      if (txResult.rows.length === 0) {
        return { success: false, error: "no_scheduled_installments" };
      }

      // 3. Calculate total
      const fullTotalCents = txResult.rows.reduce((s, r) => s + parseInt(r.amount_cents, 10), 0);
      let finalCents = fullTotalCents;
      let discountCents = 0;
      let discountApplied = false;

      const discountRate = params.discountRate || 0;
      const discountType = params.discountType || "simple";

      if (discountRate > 0) {
        if (discountType === "simple") {
          // Desconto simples: fullTotal * (1 - discountRate)
          discountCents = Math.round(fullTotalCents * discountRate);
          finalCents = fullTotalCents - discountCents;
          discountApplied = true;
        } else if (discountType === "present_value") {
          // Valor presente: recalcula baseado no VP das parcelas
          const rate = parseFloat(plan.interest_rate);
          const pmt = fullTotalCents / txResult.rows.length;
          const pv = Math.round(calculatePresentValue(pmt, rate, txResult.rows.length));
          finalCents = pv;
          discountCents = fullTotalCents - pv;
          discountApplied = true;
        }
      }

      // 4. Mark installments as paid
      const paidDate = params.paidDate || new Date().toISOString().slice(0, 10);
      const txIds = txResult.rows.map((r) => r.id);
      await pool.query(
        `UPDATE transactions
         SET installment_status = 'paid', paid_date = $1
         WHERE id = ANY($2::uuid[])`,
        [paidDate, txIds]
      );

      // 5. Calculate progress
      const progressResult = await pool.query<{ paid: string; total: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE installment_status = 'paid') as paid,
           COUNT(*) as total
         FROM transactions
         WHERE installment_plan_id = $1 AND deleted_at IS NULL`,
        [params.planId]
      );
      const paid = parseInt(progressResult.rows[0].paid, 10);
      const total = parseInt(progressResult.rows[0].total, 10);

      // 6. Format response
      const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
      const response: any = {
        success: true,
        planId: params.planId,
        planDescription: plan.description,
        installmentsPaid: txIds.length,
        installmentNumbers: txResult.rows.map((r) => r.installment_number),
        fullTotalCents,
        finalCents,
        discountCents,
        discountPercent: discountRate,
        discountType: discountApplied ? discountType : null,
        paidDate,
        planProgress: `${paid}/${total} parcelas pagas`,
        isComplete: paid >= total,
        message: discountApplied
          ? `âœ… ${txIds.length} parcela(s) antecipada(s) com ${(discountRate * 100).toFixed(2)}% desconto: ${fmt(finalCents)} (economizou ${fmt(discountCents)})`
          : `âœ… ${txIds.length} parcela(s) paga(s): ${fmt(finalCents)}`,
      };
      return response;
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * simulate_prepayment â€” Simula antecipaÃ§Ã£o sem modificar dados
 */
export const simulatePrepayment: ToolDefinition = {
  name: "simulate_prepayment",
  description: "Simula antecipaÃ§Ã£o de parcelas mostrando quanto pagaria com/sem desconto.",
  parameters: Type.Object({
    householdId: Type.String(),
    planId: Type.String(),
    numberOfInstallments: Type.Integer({ minimum: 1, maximum: 60 }),
    discountRate: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
    discountType: Type.Optional(Type.Union([Type.Literal("simple"), Type.Literal("present_value")])),
  }),
  execute: async (params: Params) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const planResult = await pool.query<any>(
        `SELECT id, description, total_amount_cents, installments_count, interest_rate
         FROM installment_plans WHERE id = $1 AND household_id = $2`,
        [params.planId, params.householdId]
      );
      if (planResult.rows.length === 0) {
        return { success: false, error: "plan_not_found" };
      }
      const plan = planResult.rows[0];

      const txResult = await pool.query<any>(
        `SELECT id, installment_number, amount_cents, date::text
         FROM transactions
         WHERE installment_plan_id = $1
           AND installment_status = 'scheduled'
           AND deleted_at IS NULL
         ORDER BY installment_number ASC
         LIMIT $2`,
        [params.planId, params.numberOfInstallments]
      );
      if (txResult.rows.length === 0) {
        return { success: false, error: "no_scheduled_installments" };
      }

      const fullTotalCents = txResult.rows.reduce((s, r) => s + parseInt(r.amount_cents, 10), 0);
      const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

      // Simulate various discount rates
      const simulations: any[] = [
        {
          label: "Sem desconto",
          finalCents: fullTotalCents,
          discountCents: 0,
          discountRate: 0,
        },
      ];

      const discountRate = params.discountRate || 0;
      const discountType = params.discountType || "simple";

      if (discountRate > 0) {
        let final = fullTotalCents;
        if (discountType === "simple") {
          final = fullTotalCents - Math.round(fullTotalCents * discountRate);
        } else {
          const rate = parseFloat(plan.interest_rate);
          const pmt = fullTotalCents / txResult.rows.length;
          final = Math.round(calculatePresentValue(pmt, rate, txResult.rows.length));
        }
        simulations.push({
          label: `${(discountRate * 100).toFixed(2)}% desconto (${discountType})`,
          finalCents: final,
          discountCents: fullTotalCents - final,
          discountRate,
        });
      }

      // Add common discount rates for comparison
      for (const rate of [0.05, 0.1, 0.15]) {
        if (rate === discountRate) continue;
        const final = fullTotalCents - Math.round(fullTotalCents * rate);
        simulations.push({
          label: `${(rate * 100).toFixed(0)}% desconto`,
          finalCents: final,
          discountCents: fullTotalCents - final,
          discountRate: rate,
        });
      }

      // Build response
      const lines: string[] = [
        `ðŸ”® SimulaÃ§Ã£o de antecipaÃ§Ã£o: ${plan.description}`,
        `   ${txResult.rows.length} parcela(s) a antecipar`,
        `   Valor cheio: ${fmt(fullTotalCents)}`,
        ``,
        `   CenÃ¡rios:`,
      ];
      for (const s of simulations) {
        lines.push(`     â€¢ ${s.label}: ${fmt(s.finalCents)} (economia: ${fmt(s.discountCents)})`);
      }

      return {
        success: true,
        planId: params.planId,
        planDescription: plan.description,
        installmentsCount: txResult.rows.length,
        fullTotalCents,
        simulations,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
