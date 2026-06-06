/**
 * installment-score — Financial health score based on installment usage
 *
 * Computes a score (0-100) and key metrics:
 * - % of income committed to installments
 * - Total active installment debt
 * - Overdue count
 * - Average installment size
 * - Concentration in credit card vs other
 *
 * Score components:
 * - Debt-to-income ratio (40%)
 * - Overdue count (25%)
 * - Diversity (15%)
 * - Recent activity (20%)
 */

import type { Pool } from "pg";

export interface ScoreBreakdown {
  category: string;
  score: number;  // 0-100 contribution
  weight: number;  // 0-1
  description: string;
}

export interface InstallmentScore {
  totalScore: number;  // 0-100
  rating: "excellent" | "good" | "fair" | "poor" | "critical";
  totalInstallmentDebtCents: number;
  monthlyIncomeCents: number;
  debtToIncomeRatio: number;  // 0-1
  overdueCount: number;
  activePlans: number;
  averageInstallmentCents: number;
  creditCardConcentration: number;  // 0-1
  breakdown: ScoreBreakdown[];
  recommendations: string[];
}

export async function computeInstallmentScore(
  pool: Pool,
  householdId: string
): Promise<InstallmentScore> {
  // 1. Get total installment debt (remaining)
  const debtResult = await pool.query<{ rows: Array<{ remaining: string }> }>(
    `SELECT
       COALESCE(SUM(t.amount_cents) FILTER (WHERE t.installment_status = 'scheduled'), 0) as remaining
     FROM transactions t
     JOIN installment_plans p ON p.id = t.installment_plan_id
     WHERE t.household_id = $1
       AND t.deleted_at IS NULL
       AND p.type = 'out_of_card'`,
    [householdId]
  );
  const totalInstallmentDebtCents = parseInt(debtResult.rows[0].remaining, 10);

  // 2. Get monthly income (last 3 months average)
  const incomeResult = await pool.query<{ rows: Array<{ total: string }> }>(
    `SELECT COALESCE(AVG(monthly_total), 0) as total
     FROM (
       SELECT DATE_TRUNC('month', date) as month, SUM(amount_cents) as monthly_total
       FROM transactions
       WHERE household_id = $1 AND kind = 'income' AND deleted_at IS NULL
         AND date >= CURRENT_DATE - INTERVAL '3 months'
       GROUP BY month
     ) sub`,
    [householdId]
  );
  const monthlyIncomeCents = parseInt(incomeResult.rows[0].total, 10);

  // 3. Get overdue count
  const overdueResult = await pool.query<{ rows: Array<{ count: string }> }>(
    `SELECT COUNT(*) as count
     FROM transactions t
     JOIN installment_plans p ON p.id = t.installment_plan_id
     WHERE t.household_id = $1
       AND t.installment_status = 'scheduled'
       AND t.date < CURRENT_DATE
       AND t.deleted_at IS NULL`,
    [householdId]
  );
  const overdueCount = parseInt(overdueResult.rows[0].count, 10);

  // 4. Get active plans
  const plansResult = await pool.query<{ rows: Array<{ count: string }> }>(
    `SELECT COUNT(DISTINCT p.id) as count
     FROM installment_plans p
     JOIN transactions t ON t.installment_plan_id = p.id
     WHERE p.household_id = $1
       AND t.installment_status = 'scheduled'
       AND t.deleted_at IS NULL`,
    [householdId]
  );
  const activePlans = parseInt(plansResult.rows[0].count, 10);

  // 5. Average installment size
  const avgResult = await pool.query<{ rows: Array<{ avg: string }> }>(
    `SELECT COALESCE(AVG(t.amount_cents), 0) as avg
     FROM transactions t
     JOIN installment_plans p ON p.id = t.installment_plan_id
     WHERE t.household_id = $1
       AND t.installment_status = 'scheduled'
       AND t.deleted_at IS NULL`,
    [householdId]
  );
  const averageInstallmentCents = parseInt(avgResult.rows[0].avg, 10);

  // 6. Credit card concentration
  const concResult = await pool.query<{ rows: Array<{ card_total: string; total: string }> }>(
    `SELECT
       COALESCE(SUM(t.amount_cents) FILTER (WHERE p.type = 'credit_card'), 0) as card_total,
       COALESCE(SUM(t.amount_cents), 0) as total
     FROM transactions t
     JOIN installment_plans p ON p.id = t.installment_plan_id
     WHERE t.household_id = $1
       AND t.installment_status = 'scheduled'
       AND t.deleted_at IS NULL`,
    [householdId]
  );
  const cardTotal = parseInt(concResult.rows[0].card_total, 10);
  const totalScheduled = parseInt(concResult.rows[0].total, 10);
  const creditCardConcentration = totalScheduled > 0 ? cardTotal / totalScheduled : 0;

  // 7. Compute scores
  const debtToIncomeRatio = monthlyIncomeCents > 0 ? totalInstallmentDebtCents / monthlyIncomeCents : 0;

  // Debt-to-income score: < 10% = 100, > 100% = 0
  const dtiScore = Math.max(0, Math.min(100, 100 - (debtToIncomeRatio * 100)));

  // Overdue score: 0 overdue = 100, each overdue -25
  const overdueScore = Math.max(0, 100 - overdueCount * 25);

  // Diversity score: prefer 2-5 active plans (diversified but not chaotic)
  let diversityScore: number;
  if (activePlans === 0) diversityScore = 100;
  else if (activePlans <= 5) diversityScore = 100 - (activePlans - 1) * 5;
  else diversityScore = Math.max(0, 75 - (activePlans - 5) * 10);

  // Concentration score: < 50% card = 100, > 90% card = 0
  const concentrationScore = Math.max(0, Math.min(100, 100 - (creditCardConcentration * 100 - 50) * 2));

  const breakdown: ScoreBreakdown[] = [
    {
      category: "Dívida/Renda",
      score: dtiScore,
      weight: 0.4,
      description:
        debtToIncomeRatio < 0.1
          ? "Saudável: < 10% da renda comprometida"
          : debtToIncomeRatio < 0.3
            ? "Atenção: 10-30% da renda em parcelas"
            : debtToIncomeRatio < 0.5
              ? "Arriscado: 30-50% da renda em parcelas"
              : "Crítico: > 50% da renda em parcelas",
    },
    {
      category: "Atrasos",
      score: overdueScore,
      weight: 0.25,
      description: overdueCount === 0 ? "Nenhuma parcela atrasada" : `${overdueCount} parcela(s) atrasada(s)`,
    },
    {
      category: "Diversificação",
      score: diversityScore,
      weight: 0.15,
      description:
        activePlans === 0
          ? "Nenhum parcelamento ativo"
          : activePlans <= 3
            ? `${activePlans} plano(s) ativo(s) — diversificação saudável`
            : activePlans <= 5
              ? `${activePlans} plano(s) ativo(s) — atenção`
              : `${activePlans} plano(s) ativo(s) — fragmentação excessiva`,
    },
    {
      category: "Concentração cartão",
      score: concentrationScore,
      weight: 0.2,
      description:
        creditCardConcentration < 0.5
          ? "Boa: < 50% no cartão"
          : creditCardConcentration < 0.8
            ? `Atenção: ${Math.round(creditCardConcentration * 100)}% no cartão`
            : `Crítico: ${Math.round(creditCardConcentration * 100)}% no cartão`,
    },
  ];

  const totalScore = Math.round(
    breakdown.reduce((sum, b) => sum + b.score * b.weight, 0)
  );

  // Determine rating
  let rating: InstallmentScore["rating"];
  if (totalScore >= 80) rating = "excellent";
  else if (totalScore >= 60) rating = "good";
  else if (totalScore >= 40) rating = "fair";
  else if (totalScore >= 20) rating = "poor";
  else rating = "critical";

  // Recommendations
  const recommendations: string[] = [];
  if (debtToIncomeRatio > 0.3) {
    recommendations.push("💡 Considere antecipar parcelas para reduzir o comprometimento de renda");
  }
  if (overdueCount > 0) {
    recommendations.push("🚨 Quite as parcelas atrasadas o quanto antes para evitar juros");
  }
  if (creditCardConcentration > 0.7) {
    recommendations.push("💳 Diversifique: prefira boleto/carnê para preservar limite do cartão");
  }
  if (activePlans > 6) {
    recommendations.push("📋 Você tem muitos parcelamentos. Considere consolidar");
  }
  if (recommendations.length === 0) {
    recommendations.push("✨ Sua saúde financeira está ótima em relação a parcelamentos!");
  }

  return {
    totalScore,
    rating,
    totalInstallmentDebtCents,
    monthlyIncomeCents,
    debtToIncomeRatio,
    overdueCount,
    activePlans,
    averageInstallmentCents,
    creditCardConcentration,
    breakdown,
    recommendations,
  };
}

/**
 * Format score for display.
 */
export function formatScore(score: InstallmentScore): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const ratingIcon: Record<InstallmentScore["rating"], string> = {
    excellent: "🌟",
    good: "✅",
    fair: "⚠️",
    poor: "🔴",
    critical: "🚨",
  };
  const ratingLabel: Record<InstallmentScore["rating"], string> = {
    excellent: "Excelente",
    good: "Bom",
    fair: "Regular",
    poor: "Ruim",
    critical: "Crítico",
  };

  const lines: string[] = [];
  lines.push(`${ratingIcon[score.rating]} Score de Parcelamento: ${score.totalScore}/100 — ${ratingLabel[score.rating]}`);
  lines.push("");
  lines.push(`📊 Métricas:`);
  lines.push(`   Dívida em parcelas: ${fmt(score.totalInstallmentDebtCents)}`);
  lines.push(`   Renda mensal: ${fmt(score.monthlyIncomeCents)}`);
  lines.push(`   Comprometimento: ${(score.debtToIncomeRatio * 100).toFixed(1)}%`);
  lines.push(`   Parcelas atrasadas: ${score.overdueCount}`);
  lines.push(`   Planos ativos: ${score.activePlans}`);
  lines.push(`   Parcela média: ${fmt(score.averageInstallmentCents)}`);
  lines.push(`   Concentração cartão: ${(score.creditCardConcentration * 100).toFixed(0)}%`);
  lines.push("");
  lines.push(`📋 Breakdown:`);
  for (const b of score.breakdown) {
    const bar = "█".repeat(Math.round(b.score / 10)) + "░".repeat(10 - Math.round(b.score / 10));
    lines.push(`   ${b.category} (${(b.weight * 100).toFixed(0)}%): ${b.score} ${bar}`);
    lines.push(`      ${b.description}`);
  }
  lines.push("");
  lines.push(`💡 Recomendações:`);
  for (const r of score.recommendations) {
    lines.push(`   ${r}`);
  }
  return lines.join("\n");
}
