/**
 * payment-score — Score de pontualidade nos pagamentos
 *
 * Calcula % de contas pagas em dia nos últimos N meses.
 *
 * Componentes:
 * - on_time_rate (% pagas em dia, sem atraso)
 * - early_rate (% pagas adiantadas)
 * - late_rate (% pagas atrasadas)
 * - cancelled_rate
 *
 * Score 0-100 com rating.
 */

import type { Pool } from "pg";

export interface PaymentScore {
  totalScore: number;
  rating: "excellent" | "good" | "fair" | "poor" | "critical";
  totalAccounts: number;
  onTimeCount: number;
  earlyCount: number;
  lateCount: number;
  cancelledCount: number;
  onTimeRate: number;  // 0-1
  earlyRate: number;  // 0-1
  lateRate: number;  // 0-1
  averageDaysEarly: number;
  averageDaysLate: number;
  byMonth: Array<{
    yearMonth: string;
    onTimeRate: number;
    count: number;
  }>;
  recommendations: string[];
}

export async function computePaymentScore(
  pool: import("pg").Pool,
  householdId: string,
  monthsBack: number = 6
): Promise<PaymentScore> {
  // Get all paid accounts in the last N months
  const result = await pool.query<{ rows: any[] }>(
    `SELECT
       id, description, amount_cents,
       due_date::text as due,
       paid_date::text as paid,
       status,
       (paid_date - due_date)::int as days_diff
     FROM accounts_payable
     WHERE household_id = $1
       AND status IN ('paid', 'cancelled')
       AND deleted_at IS NULL
       AND paid_date IS NOT NULL
       AND paid_date >= CURRENT_DATE - ($2 || ' months')::interval`,
    [householdId, monthsBack]
  );

  const onTime: any[] = [];
  const early: any[] = [];
  const late: any[] = [];
  const cancelled: any[] = [];

  for (const r of result.rows) {
    if (r.status === "cancelled") {
      cancelled.push(r);
      continue;
    }
    const days = r.days_diff || 0;
    if (days < 0) early.push({ ...r, daysEarly: -days });
    else if (days === 0) onTime.push(r);
    else late.push({ ...r, daysLate: days });
  }

  const total = onTime.length + early.length + late.length;
  const onTimeRate = total > 0 ? onTime.length / total : 0;
  const earlyRate = total > 0 ? early.length / total : 0;
  const lateRate = total > 0 ? late.length / total : 0;
  const cancelledRate = result.rows.length > 0 ? cancelled.length / result.rows.length : 0;

  const averageDaysEarly = early.length > 0
    ? early.reduce((s, x) => s + x.daysEarly, 0) / early.length
    : 0;
  const averageDaysLate = late.length > 0
    ? late.reduce((s, x) => s + x.daysLate, 0) / late.length
    : 0;

  // By month
  const byMonthMap = new Map<string, { onTime: number; total: number }>();
  for (const r of [...onTime, ...early, ...late]) {
    const ym = r.paid.slice(0, 7);
    if (!byMonthMap.has(ym)) byMonthMap.set(ym, { onTime: 0, total: 0 });
    const m = byMonthMap.get(ym)!;
    m.onTime += r.days_diff <= 0 ? 1 : 0;
    m.total += 1;
  }
  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([yearMonth, v]) => ({
      yearMonth,
      onTimeRate: v.total > 0 ? v.onTime / v.total : 0,
      count: v.total,
    }));

  // Score: 100 * onTimeRate + 50 * earlyRate (bonus) - 50 * lateRate (penalty)
  let totalScore = Math.round(100 * onTimeRate + 50 * earlyRate - 50 * lateRate);
  totalScore = Math.max(0, Math.min(100, totalScore));

  // Rating
  let rating: PaymentScore["rating"];
  if (totalScore >= 90) rating = "excellent";
  else if (totalScore >= 75) rating = "good";
  else if (totalScore >= 50) rating = "fair";
  else if (totalScore >= 25) rating = "poor";
  else rating = "critical";

  // Recommendations
  const recommendations: string[] = [];
  if (lateRate > 0.2) {
    recommendations.push(`🚨 ${Math.round(lateRate * 100)}% das contas foram pagas atrasadas. Configure lembretes mais cedo.`);
  }
  if (averageDaysLate > 5) {
    recommendations.push(`⏰ Em média você atrasa ${averageDaysLate.toFixed(1)} dias. Configure débito automático.`);
  }
  if (onTimeRate + earlyRate === 0 && total > 0) {
    recommendations.push("💡 Nenhuma conta paga em dia. Ative débito automático para principais contas.");
  }
  if (total === 0) {
    recommendations.push("📋 Sem histórico de pagamentos ainda. Crie e pague contas para gerar score.");
  } else if (totalScore >= 90) {
    recommendations.push("✨ Excelente! Continue pagando suas contas em dia.");
  }

  return {
    totalScore,
    rating,
    totalAccounts: result.rows.length,
    onTimeCount: onTime.length,
    earlyCount: early.length,
    lateCount: late.length,
    cancelledCount: cancelled.length,
    onTimeRate,
    earlyRate,
    lateRate,
    averageDaysEarly,
    averageDaysLate,
    byMonth,
    recommendations,
  };
}

export function formatPaymentScore(score: PaymentScore): string {
  const ratingIcon: Record<PaymentScore["rating"], string> = {
    excellent: "🌟", good: "✅", fair: "⚠️", poor: "🔴", critical: "🚨",
  };
  const ratingLabel: Record<PaymentScore["rating"], string> = {
    excellent: "Excelente", good: "Bom", fair: "Regular",
    poor: "Ruim", critical: "Crítico",
  };

  const lines: string[] = [];
  lines.push(`${ratingIcon[score.rating]} Score de Pagamentos: ${score.totalScore}/100 — ${ratingLabel[score.rating]}`);
  lines.push("");
  lines.push(`📊 Estatísticas (últimos 6 meses):`);
  lines.push(`   Total de contas: ${score.totalAccounts}`);
  lines.push(`   ✅ Em dia: ${score.onTimeCount} (${(score.onTimeRate * 100).toFixed(0)}%)`);
  lines.push(`   ⏰ Adiantadas: ${score.earlyCount} (${(score.earlyRate * 100).toFixed(0)}%) — média ${score.averageDaysEarly.toFixed(1)} dia(s) antes`);
  lines.push(`   🚨 Atrasadas: ${score.lateCount} (${(score.lateRate * 100).toFixed(0)}%) — média ${score.averageDaysLate.toFixed(1)} dia(s) depois`);
  if (score.cancelledCount > 0) {
    lines.push(`   ❌ Canceladas: ${score.cancelledCount}`);
  }

  if (score.byMonth.length > 0) {
    lines.push("");
    lines.push(`📅 Evolução mensal:`);
    for (const m of score.byMonth.slice(-6)) {
      const bar = "█".repeat(Math.round(m.onTimeRate * 10)) + "░".repeat(10 - Math.round(m.onTimeRate * 10));
      lines.push(`   ${m.yearMonth}: ${bar} ${(m.onTimeRate * 100).toFixed(0)}% (${m.count})`);
    }
  }

  lines.push("");
  lines.push(`💡 Recomendações:`);
  for (const r of score.recommendations) {
    lines.push(`   ${r}`);
  }
  return lines.join("\n");
}
