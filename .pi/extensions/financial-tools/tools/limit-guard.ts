/**
 * limit-guard — Credit card limit usage detection
 *
 * - Checks current usage (sum of open + closed unpaid statements) vs limit
 * - Warns when usage > 80% (caution) or > 100% (over limit)
 * - Suggests paying outstanding statements to free up limit
 */

import type { Pool } from "pg";

export interface LimitStatus {
  accountId: string;
  accountName: string;
  creditLimitCents: number;
  usedCents: number;  // sum of unpaid statements
  availableCents: number;  // limit - used
  usagePercent: number;
  status: "ok" | "caution" | "warning" | "over_limit";
  pendingStatements: Array<{
    id: string;
    cycle: string;
    dueDate: string;
    totalCents: number;
    paidCents: number;
    remaining: number;
    daysUntilDue: number;
  }>;
}

/**
 * Compute limit usage for a single card.
 */
export async function getLimitStatus(
  pool: Pool,
  accountId: string,
  today: string
): Promise<LimitStatus | null> {
  const accResult = await pool.query<{ rows: Array<{
    id: string;
    name: string;
    is_credit_card: boolean;
    credit_limit_cents: string | null;
  }> }>(
    `SELECT id, name, is_credit_card, credit_limit_cents
     FROM accounts WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  );
  if (accResult.rows.length === 0 || !accResult.rows[0].is_credit_card) return null;
  const acc = accResult.rows[0];
  const limit = parseInt(acc.credit_limit_cents || "0", 10);

  // Get all non-paid, non-cancelled statements
  const stmtResult = await pool.query<{ rows: Array<{
    id: string;
    cycle_year_month: string;
    due_date: string;
    total_cents: string;
    paid_cents: string;
  }> }>(
    `SELECT id, cycle_year_month, due_date::text, total_cents, paid_cents
     FROM statements
     WHERE account_id = $1
       AND status IN ('open', 'closed', 'partial', 'overdue')
     ORDER BY due_date ASC`,
    [accountId]
  );

  const todayDate = new Date(today);
  const pendingStatements = stmtResult.rows.map((s) => {
    const total = parseInt(s.total_cents, 10);
    const paid = parseInt(s.paid_cents, 10);
    const remaining = total - paid;
    const dueDate = new Date(s.due_date);
    const daysUntilDue = Math.floor((dueDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      id: s.id,
      cycle: s.cycle_year_month,
      dueDate: s.due_date,
      totalCents: total,
      paidCents: paid,
      remaining,
      daysUntilDue,
    };
  });

  const used = pendingStatements.reduce((sum, s) => sum + s.remaining, 0);
  const available = limit - used;
  const usagePercent = limit > 0 ? Math.round((used / limit) * 100) : 0;

  let status: LimitStatus["status"];
  if (usagePercent >= 100) status = "over_limit";
  else if (usagePercent >= 90) status = "warning";
  else if (usagePercent >= 80) status = "caution";
  else status = "ok";

  return {
    accountId: acc.id,
    accountName: acc.name,
    creditLimitCents: limit,
    usedCents: used,
    availableCents: available,
    usagePercent,
    status,
    pendingStatements,
  };
}

/**
 * Get limit status for all credit cards in a household.
 */
export async function getAllLimitStatuses(
  pool: Pool,
  householdId: string,
  today: string
): Promise<LimitStatus[]> {
  const result = await pool.query<{ rows: Array<{ id: string }> }>(
    `SELECT id FROM accounts
     WHERE household_id = $1 AND is_credit_card = true AND deleted_at IS NULL`,
    [householdId]
  );
  const statuses: LimitStatus[] = [];
  for (const row of result.rows) {
    const s = await getLimitStatus(pool, row.id, today);
    if (s) statuses.push(s);
  }
  return statuses;
}

/**
 * Format a limit status for display.
 */
export function formatLimitStatus(s: LimitStatus): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const icon: Record<LimitStatus["status"], string> = {
    ok: "✅",
    caution: "⚠️",
    warning: "🔴",
    over_limit: "🚨",
  };
  const lines: string[] = [];
  lines.push(`${icon[s.status]} ${s.accountName}: ${s.usagePercent}% do limite usado`);
  lines.push(`   Limite: ${fmt(s.creditLimitCents)} | Usado: ${fmt(s.usedCents)} | Disponível: ${fmt(s.availableCents)}`);

  if (s.usagePercent >= 80) {
    if (s.pendingStatements.length > 0) {
      const first = s.pendingStatements[0];
      lines.push(`   💡 Pagar fatura ${first.cycle} libera ${fmt(first.remaining)}`);
    }
  }
  if (s.status === "over_limit") {
    lines.push(`   🚨 ESTOURO DE LIMITE! Reduza gastos ou pague faturas.`);
  }
  if (s.pendingStatements.length > 0 && s.pendingStatements.some((p) => p.daysUntilDue < 0)) {
    const overdue = s.pendingStatements.filter((p) => p.daysUntilDue < 0);
    lines.push(`   ⏰ ${overdue.length} fatura(s) atrasada(s)`);
  }
  return lines.join("\n");
}
