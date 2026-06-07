/**
 * price-alerts — Alerta de variação de valor em contas recorrentes
 *
 * Detecta contas cujo valor subiu/desceu mais que X% em relação à média.
 * Útil para:
 * - Conta de luz subiu 40% (clima, bandeira tarifária)
 * - Internet subiu (reajuste anual)
 * - Streaming mudou de preço
 *
 * Compara o valor atual (próxima ocorrência pendente) com a média histórica.
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";

const HOUSEHOLD_DEFAULT = process.env.HOUSEHOLD_ID || "550e8400-e29b-41d4-a716-446655440000";
const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

interface PriceAlert {
  description: string;
  currentAmountCents: number;
  historicalAverageCents: number;
  variationPercent: number;  // positive = subiu, negative = desceu
  alertLevel: "info" | "warning" | "alert";
  previousAmounts: number[];
  possibleReason?: string;
}

export async function detectPriceAlerts(
  pool: import("pg").Pool,
  householdId: string,
  thresholdPercent: number = 15
): Promise<PriceAlert[]> {
  // For each recurring account, find the pending/overdue one and historical paid
  const pendingResult = await pool.query<{ rows: any[] }>(
    `SELECT id, description, amount_cents, frequency, account_id
     FROM accounts_payable
     WHERE household_id = $1
       AND status IN ('pending', 'overdue')
       AND type = 'recurring'
       AND deleted_at IS NULL`,
    [householdId]
  );

  const alerts: PriceAlert[] = [];

  for (const pending of pendingResult.rows) {
    const currentCents = parseInt(pending.amount_cents, 10);

    // Get last 6 paid occurrences of same description
    const historyResult = await pool.query<{ rows: any[] }>(
      `SELECT amount_cents, paid_date::text, due_date::text
       FROM accounts_payable
       WHERE household_id = $1
         AND description = $2
         AND status = 'paid'
         AND deleted_at IS NULL
         AND paid_date >= CURRENT_DATE - INTERVAL '12 months'
       ORDER BY paid_date DESC
       LIMIT 6`,
      [householdId, pending.description]
    );

    if (historyResult.rows.length < 2) continue;  // not enough data

    const previousAmounts = historyResult.rows.map((r) => parseInt(r.amount_cents, 10));
    const avg = previousAmounts.reduce((s, v) => s + v, 0) / previousAmounts.length;

    const variation = ((currentCents - avg) / avg) * 100;

    if (Math.abs(variation) < thresholdPercent) continue;

    let level: PriceAlert["alertLevel"] = "info";
    if (Math.abs(variation) >= 50) level = "alert";
    else if (Math.abs(variation) >= 25) level = "warning";

    // Try to guess reason
    let possibleReason: string | undefined;
    if (variation > 0) {
      if (pending.frequency === "monthly" && variation > 30) {
        possibleReason = "Conta mensal subiu muito. Verifique se houve mudança de plano ou tarifa.";
      } else if (pending.frequency === "yearly") {
        possibleReason = "Reajuste anual (comum em assinaturas anuais).";
      } else if (variation > 100) {
        possibleReason = "Aumento drástico. Vale ligar para o fornecedor.";
      }
    } else {
      possibleReason = "Conta diminuiu. Verifique se a categoria/serviço mudou.";
    }

    alerts.push({
      description: pending.description,
      currentAmountCents: currentCents,
      historicalAverageCents: Math.round(avg),
      variationPercent: Math.round(variation * 10) / 10,
      alertLevel: level,
      previousAmounts: previousAmounts.slice(0, 6),
      possibleReason,
    });
  }

  // Sort: biggest variation first
  alerts.sort((a, b) => Math.abs(b.variationPercent) - Math.abs(a.variationPercent));
  return alerts;
}

export const checkPriceAlerts: ToolDefinition = {
  name: "check_price_alerts",
  description: "Detecta contas recorrentes com valor muito diferente da média histórica.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    thresholdPercent: Type.Optional(Type.Integer({ minimum: 5, maximum: 100 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const threshold = params.thresholdPercent || 15;
      const alerts = await detectPriceAlerts(pool, householdId, threshold);

      const lines: string[] = [];
      if (alerts.length === 0) {
        lines.push(`✅ Nenhum alerta de preço. Todas as contas estão dentro da variação de ${threshold}%.`);
      } else {
        lines.push(`🚨 ${alerts.length} conta(s) com variação significativa (>${threshold}%):\n`);
        for (const a of alerts) {
          const icon = a.alertLevel === "alert" ? "🚨" : a.alertLevel === "warning" ? "⚠️" : "ℹ️";
          const direction = a.variationPercent > 0 ? "📈 SUBIU" : "📉 DESCEU";
          lines.push(`${icon} ${a.description} — ${direction} ${Math.abs(a.variationPercent)}%`);
          lines.push(`   Atual: ${fmt(a.currentAmountCents)} | Média: ${fmt(a.historicalAverageCents)}`);
          lines.push(`   Últimos valores: ${a.previousAmounts.map((v) => fmt(v)).join(", ")}`);
          if (a.possibleReason) {
            lines.push(`   💡 ${a.possibleReason}`);
          }
          lines.push("");
        }
      }

      return {
        success: true,
        alertCount: alerts.length,
        alerts,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
