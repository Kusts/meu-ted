/**
 * goals-budgets — Helpers para metas e orçamentos
 *
 * Metas (goals):
 * - savings: juntar valor (ex: R$ 10.000 em 12 meses)
 * - income: aumentar receita
 * - debt_payoff: quitar dívida
 * - emergency_fund: reserva de emergência
 * - purchase: comprar algo específico
 *
 * Cálculo de progresso:
 * - progress = current / target
 * - days_remaining = target_date - today
 * - expected_progress = (today - start_date) / (target_date - start_date)
 * - status: ahead | on_track | behind | at_risk
 *
 * Orçamentos (budgets):
 * - Limite de gasto por categoria/período
 * - spent = SUM(transactions) no período
 * - remaining = limit - spent
 * - %_used = spent / limit * 100
 * - alert quando >= 80% (warning) ou >= 100% (critical)
 */

import type { Pool } from "pg";

const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

export type GoalType = "savings" | "income" | "debt_payoff" | "emergency_fund" | "purchase";
export type GoalStatus = "active" | "paused" | "achieved" | "cancelled" | "failed";

export interface Goal {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  goal_type: GoalType;
  target_amount_cents: string;
  current_amount_cents: string;
  start_date: string;
  target_date: string | null;
  category_id: string | null;
  account_id: string | null;
  status: GoalStatus;
  achieved_at: string | null;
  notes: string | null;
}

export interface GoalProgress {
  goalId: string;
  name: string;
  goalType: GoalType;
  targetCents: number;
  currentCents: number;
  remainingCents: number;
  progressPercent: number;
  status: "ahead" | "on_track" | "behind" | "at_risk" | "achieved" | "unknown";
  daysRemaining: number | null;
  daysSinceStart: number;
  totalDays: number | null;
  expectedProgressPercent: number;
  monthlyRequiredCents: number | null;  // quanto precisa poupar/mês para atingir
  formatted: string;
}

export function computeGoalProgress(goal: Goal, today: string = new Date().toISOString().slice(0, 10)): GoalProgress {
  const targetCents = parseInt(goal.target_amount_cents, 10);
  const currentCents = parseInt(goal.current_amount_cents, 10);
  const remainingCents = Math.max(0, targetCents - currentCents);
  const progressPercent = targetCents > 0 ? (currentCents / targetCents) * 100 : 0;

  const start = new Date(goal.start_date);
  const t = new Date(today);
  const daysSinceStart = Math.max(0, Math.floor((t.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  let daysRemaining: number | null = null;
  let totalDays: number | null = null;
  let expectedProgressPercent = 0;
  let monthlyRequiredCents: number | null = null;
  let status: GoalProgress["status"] = "unknown";

  if (goal.target_date) {
    const target = new Date(goal.target_date);
    totalDays = Math.max(1, Math.floor((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    daysRemaining = Math.max(0, Math.floor((target.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)));
    expectedProgressPercent = totalDays > 0 ? (daysSinceStart / totalDays) * 100 : 0;

    if (currentCents >= targetCents) {
      status = "achieved";
    } else if (daysRemaining === 0) {
      status = "at_risk";  // prazo esgotado e não atingiu
    } else {
      const diff = progressPercent - expectedProgressPercent;
      if (diff >= 10) status = "ahead";
      else if (diff >= -10) status = "on_track";
      else if (diff >= -30) status = "behind";
      else status = "at_risk";
    }

    // Quanto precisa por mês
    if (daysRemaining > 0) {
      const monthsRemaining = daysRemaining / 30;
      monthlyRequiredCents = Math.round(remainingCents / monthsRemaining);
    }
  } else {
    // Sem prazo
    if (currentCents >= targetCents) status = "achieved";
    else if (currentCents > 0) status = "on_track";
  }

  // Formatação
  const lines: string[] = [];
  lines.push(`${goal.name} (${goal.goal_type})`);
  lines.push(`  ${fmt(currentCents)} / ${fmt(targetCents)} (${progressPercent.toFixed(1)}%)`);
  if (daysRemaining !== null) {
    lines.push(`  Faltam ${daysRemaining} dia(s) | Esperado: ${expectedProgressPercent.toFixed(1)}%`);
    if (monthlyRequiredCents && monthlyRequiredCents > 0) {
      lines.push(`  Precisa poupar: ${fmt(monthlyRequiredCents)}/mês`);
    }
  }
  const statusIcon: Record<GoalProgress["status"], string> = {
    ahead: "🚀", on_track: "✅", behind: "⚠️", at_risk: "🚨", achieved: "🎉", unknown: "❓",
  };
  lines.push(`  Status: ${statusIcon[status]} ${status}`);

  return {
    goalId: goal.id,
    name: goal.name,
    goalType: goal.goal_type,
    targetCents,
    currentCents,
    remainingCents,
    progressPercent,
    status,
    daysRemaining,
    daysSinceStart,
    totalDays,
    expectedProgressPercent,
    monthlyRequiredCents,
    formatted: lines.join("\n"),
  };
}

/**
 * Refresh all goals: check if achieved or at_risk.
 */
export async function refreshGoals(pool: Pool, householdId: string): Promise<{
  achieved: number;
  atRisk: number;
  checked: number;
}> {
  const result = await pool.query<{ rows: Goal[] }>(
    `SELECT * FROM goals WHERE household_id = $1 AND status = 'active'`,
    [householdId]
  );

  let achieved = 0;
  let atRisk = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const goal of result.rows) {
    const progress = computeGoalProgress(goal, today);
    if (progress.status === "achieved" && goal.status !== "achieved") {
      await pool.query(
        `UPDATE goals SET status = 'achieved', achieved_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [goal.id]
      );
      achieved++;
    } else if (progress.status === "at_risk" && goal.target_date) {
      const target = new Date(goal.target_date);
      const t = new Date(today);
      if (t > target) {
        // Prazo esgotado
        await pool.query(
          `UPDATE goals SET status = 'failed', updated_at = NOW() WHERE id = $1`,
          [goal.id]
        );
        atRisk++;
      }
    }
  }

  return { achieved, atRisk, checked: result.rows.length };
}

// === BUDGETS ===

export type BudgetPeriod = "weekly" | "monthly" | "quarterly" | "yearly";
export type BudgetStatus = "active" | "paused" | "cancelled";

export interface Budget {
  id: string;
  household_id: string;
  category_id: string;
  name: string;
  amount_cents: string;
  period: BudgetPeriod;
  start_date: string;
  end_date: string | null;
  rollover: boolean;
  alert_threshold: number;
  alert_threshold_critical: number;
  status: BudgetStatus;
}

export interface BudgetStatusReport {
  budgetId: string;
  name: string;
  categoryName: string | null;
  amountCents: number;
  spentCents: number;
  remainingCents: number;
  percentUsed: number;
  status: "ok" | "warning" | "critical" | "exceeded";
  period: BudgetPeriod;
  periodStart: string;
  periodEnd: string;
  daysRemaining: number;
  daysTotal: number;
  dailyAllowance: number;
  formatted: string;
}

/**
 * Get current period boundaries for a budget.
 */
export function getCurrentPeriod(
  period: BudgetPeriod,
  startDate: string,
  today: string = new Date().toISOString().slice(0, 10)
): { start: string; end: string; daysTotal: number; daysRemaining: number } {
  const t = new Date(today);
  let periodStart = new Date(startDate);
  const periodEnd = new Date(periodStart);

  if (period === "monthly") {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  } else if (period === "weekly") {
    periodEnd.setDate(periodEnd.getDate() + 7);
  } else if (period === "quarterly") {
    periodEnd.setMonth(periodEnd.getMonth() + 3);
  } else if (period === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  // Avança até a data atual
  while (periodEnd < t) {
    periodStart = new Date(periodEnd);
    if (period === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
    else if (period === "weekly") periodEnd.setDate(periodEnd.getDate() + 7);
    else if (period === "quarterly") periodEnd.setMonth(periodEnd.getMonth() + 3);
    else if (period === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  }

  const daysTotal = Math.floor((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, Math.floor((periodEnd.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    start: periodStart.toISOString().slice(0, 10),
    end: periodEnd.toISOString().slice(0, 10),
    daysTotal,
    daysRemaining,
  };
}

/**
 * Compute budget status: how much spent vs limit.
 */
export async function computeBudgetStatus(
  pool: Pool,
  budget: Budget,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<BudgetStatusReport> {
  const period = getCurrentPeriod(budget.period, budget.start_date, today);

  // Get spent amount in this period
  const spentResult = await pool.query<{ rows: Array<{ total: string }> }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total
     FROM transactions
     WHERE household_id = $1
       AND category_id = $2
       AND kind = 'expense'
       AND deleted_at IS NULL
       AND date >= $3::date AND date < $4::date`,
    [budget.household_id, budget.category_id, period.start, period.end]
  );
  const spentCents = parseInt(spentResult.rows[0].total, 10);

  // Get category name
  const catResult = await pool.query(
    `SELECT name FROM categories WHERE id = $1`,
    [budget.category_id]
  );
  const categoryName = catResult.rows[0]?.name || null;

  const amountCents = parseInt(budget.amount_cents, 10);
  const remainingCents = amountCents - spentCents;
  const percentUsed = amountCents > 0 ? (spentCents / amountCents) * 100 : 0;

  let status: BudgetStatusReport["status"] = "ok";
  if (percentUsed >= budget.alert_threshold_critical) status = "exceeded";
  else if (percentUsed >= budget.alert_threshold) status = "critical";
  else if (percentUsed >= budget.alert_threshold * 0.8) status = "warning";

  // Daily allowance (remaining / days remaining)
  const dailyAllowance = period.daysRemaining > 0
    ? Math.max(0, Math.floor(remainingCents / period.daysRemaining))
    : 0;

  const lines: string[] = [];
  lines.push(`${budget.name} (${categoryName || "categoria"})`);
  lines.push(`  ${fmt(spentCents)} / ${fmt(amountCents)} (${percentUsed.toFixed(1)}%)`);
  const statusIcon: Record<BudgetStatusReport["status"], string> = {
    ok: "✅", warning: "⚠️", critical: "🔴", exceeded: "🚨",
  };
  lines.push(`  Status: ${statusIcon[status]} ${status}`);
  if (status !== "ok") {
    lines.push(`  Restante: ${fmt(remainingCents)} | Diário: ${fmt(dailyAllowance)}/dia`);
    lines.push(`  ${period.daysRemaining} dia(s) restantes no período`);
  }

  return {
    budgetId: budget.id,
    name: budget.name,
    categoryName,
    amountCents,
    spentCents,
    remainingCents,
    percentUsed,
    status,
    period: budget.period,
    periodStart: period.start,
    periodEnd: period.end,
    daysRemaining: period.daysRemaining,
    daysTotal: period.daysTotal,
    dailyAllowance,
    formatted: lines.join("\n"),
  };
}

/**
 * Get all active budgets and compute status.
 */
export async function getAllBudgetStatuses(
  pool: Pool,
  householdId: string
): Promise<BudgetStatusReport[]> {
  const result = await pool.query<{ rows: Budget[] }>(
    `SELECT * FROM budgets WHERE household_id = $1 AND status = 'active'`,
    [householdId]
  );

  const statuses: BudgetStatusReport[] = [];
  for (const budget of result.rows) {
    statuses.push(await computeBudgetStatus(pool, budget));
  }
  return statuses;
}
