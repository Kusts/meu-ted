/**
 * goals_budgets — Tools para metas e orçamentos
 *
 * 11 tools:
 * - create_goal: cria meta
 * - list_goals: lista metas com progresso
 * - contribute_to_goal: adiciona contribuição
 * - cancel_goal: cancela meta
 * - create_budget: cria orçamento por categoria
 * - list_budgets: lista orçamentos com status
 * - check_budgets: verifica status atual (alertas)
 * - refresh_goals: atualiza status (achieved/failed)
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "pi-coding-agent";
import { Pool } from "pg";
import {
  computeGoalProgress,
  computeBudgetStatus,
  getAllBudgetStatuses,
  getBudgetTrends,
  getBudgetAdjustmentSuggestion,
  refreshGoals,
  type Goal,
  type Budget,
} from "./goals-budgets.js";

const HOUSEHOLD_DEFAULT = process.env.HOUSEHOLD_ID || "550e8400-e29b-41d4-a716-446655440000";
const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

/**
 * create_goal
 */
export const createGoal: ToolDefinition = {
  name: "create_goal",
  description: "Cria uma meta financeira (juntar X, quitar dívida, etc).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    name: Type.String(),
    description: Type.Optional(Type.String()),
    goalType: Type.Union([
      Type.Literal("savings"),
      Type.Literal("income"),
      Type.Literal("debt_payoff"),
      Type.Literal("emergency_fund"),
      Type.Literal("purchase"),
    ]),
    targetAmountCents: Type.Number({ minimum: 1 }),
    startDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    targetDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
    categoryId: Type.Optional(Type.String()),
    accountId: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const result = await pool.query<{ rows: any[] }>(
        `INSERT INTO goals
         (household_id, name, description, goal_type, target_amount_cents,
          start_date, target_date, category_id, account_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10)
         RETURNING *`,
        [
          householdId, params.name, params.description || null, params.goalType,
          params.targetAmountCents, params.startDate, params.targetDate || null,
          params.categoryId || null, params.accountId || null, params.notes || null,
        ]
      );
      const goal = result.rows[0];
      const progress = computeGoalProgress(goal);
      return {
        success: true,
        goalId: goal.id,
        name: goal.name,
        targetCents: parseInt(goal.target_amount_cents, 10),
        progress: progress.progressPercent,
        status: progress.status,
        monthlyRequiredCents: progress.monthlyRequiredCents,
        message: `✅ Meta "${params.name}" criada: alvo ${fmt(params.targetAmountCents)}${params.targetDate ? ` até ${params.targetDate}` : ""}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * list_goals
 */
export const listGoals: ToolDefinition = {
  name: "list_goals",
  description: "Lista metas com progresso calculado.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    status: Type.Optional(Type.Union([
      Type.Literal("active"), Type.Literal("paused"),
      Type.Literal("achieved"), Type.Literal("cancelled"), Type.Literal("failed"),
    ])),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const filters: string[] = ["g.household_id = $1"];
      const values: any[] = [householdId];
      if (params.status) {
        values.push(params.status);
        filters.push(`g.status = $${values.length}`);
      }

      const result = await pool.query<{ rows: Goal[] }>(
        `SELECT g.* FROM goals g WHERE ${filters.join(" AND ")} ORDER BY g.created_at DESC`,
        values
      );

      const today = new Date().toISOString().slice(0, 10);
      const items = result.rows.map((g) => {
        const p = computeGoalProgress(g, today);
        return {
          id: g.id,
          name: g.name,
          goalType: g.goal_type,
          targetCents: parseInt(g.target_amount_cents, 10),
          currentCents: parseInt(g.current_amount_cents, 10),
          progressPercent: p.progressPercent,
          status: g.status,
          progressStatus: p.status,
          daysRemaining: p.daysRemaining,
          monthlyRequiredCents: p.monthlyRequiredCents,
          targetDate: g.target_date,
        };
      });

      const lines: string[] = [];
      lines.push(`🎯 ${items.length} meta(s):\n`);
      for (const i of items) {
        const statusIcon: Record<string, string> = {
          active: "📌", paused: "⏸️", achieved: "🎉", cancelled: "❌", failed: "🚨",
        };
        const progressIcon: Record<string, string> = {
          ahead: "🚀", on_track: "✅", behind: "⚠️", at_risk: "🚨", achieved: "🎉", unknown: "❓",
        };
        lines.push(`${statusIcon[i.status] || "?"} ${i.name} (${i.goalType})`);
        lines.push(`   ${fmt(i.currentCents)} / ${fmt(i.targetCents)} (${i.progressPercent.toFixed(1)}%)`);
        if (i.targetDate && i.daysRemaining !== null) {
          lines.push(`   📅 Faltam ${i.daysRemaining} dia(s) | ${progressIcon[i.progressStatus] || "?"} ${i.progressStatus}`);
          if (i.monthlyRequiredCents && i.monthlyRequiredCents > 0) {
            lines.push(`   💡 Precisa: ${fmt(i.monthlyRequiredCents)}/mês`);
          }
        }
        lines.push("");
      }

      return {
        success: true,
        total: items.length,
        items,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * contribute_to_goal
 */
export const contributeToGoal: ToolDefinition = {
  name: "contribute_to_goal",
  description: "Adiciona contribuição a uma meta.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    goalId: Type.String(),
    amountCents: Type.Number({ minimum: 1 }),
    contributionDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
    source: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const today = params.contributionDate || new Date().toISOString().slice(0, 10);

      // Insert contribution
      await pool.query(
        `INSERT INTO goal_contributions (goal_id, household_id, amount_cents, contribution_date, source, notes)
         VALUES ($1, $2, $3, $4::date, $5, $6)`,
        [params.goalId, householdId, params.amountCents, today, params.source || "manual", params.notes || null]
      );

      // Update goal
      const result = await pool.query<{ rows: Goal[] }>(
        `UPDATE goals
         SET current_amount_cents = current_amount_cents + $1,
             updated_at = NOW()
         WHERE id = $2 AND household_id = $3
         RETURNING *`,
        [params.amountCents, params.goalId, householdId]
      );
      if (result.rows.length === 0) {
        return { success: false, error: "goal_not_found" };
      }
      const goal = result.rows[0];
      const progress = computeGoalProgress(goal);

      // Auto-mark achieved
      if (progress.status === "achieved" && goal.status !== "achieved") {
        await pool.query(
          `UPDATE goals SET status = 'achieved', achieved_at = NOW() WHERE id = $1`,
          [goal.id]
        );
      }

      return {
        success: true,
        goalId: goal.id,
        name: goal.name,
        contributionCents: params.amountCents,
        newCurrentCents: parseInt(goal.current_amount_cents, 10),
        targetCents: parseInt(goal.target_amount_cents, 10),
        progressPercent: progress.progressPercent,
        achieved: progress.status === "achieved",
        message: progress.status === "achieved"
          ? `🎉 Meta "${goal.name}" ATINGIDA! ${fmt(parseInt(goal.current_amount_cents, 10))} / ${fmt(parseInt(goal.target_amount_cents, 10))}`
          : `✅ +${fmt(params.amountCents)} para "${goal.name}" — ${progress.progressPercent.toFixed(1)}% (${fmt(parseInt(goal.current_amount_cents, 10))} / ${fmt(parseInt(goal.target_amount_cents, 10))})`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * cancel_goal
 */
export const cancelGoal: ToolDefinition = {
  name: "cancel_goal",
  description: "Cancela uma meta.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    goalId: Type.String(),
    reason: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const result = await pool.query<{ rows: any[] }>(
        `UPDATE goals
         SET status = 'cancelled',
             notes = COALESCE(notes, '') || $1,
             updated_at = NOW()
         WHERE id = $2 AND household_id = $3 AND status IN ('active', 'paused')
         RETURNING id, name, current_amount_cents, target_amount_cents`,
        [
          params.reason ? `\n[Cancelada em ${new Date().toISOString().slice(0, 10)}] ${params.reason}` : `\n[Cancelada em ${new Date().toISOString().slice(0, 10)}]`,
          params.goalId, householdId,
        ]
      );
      if (result.rows.length === 0) {
        return { success: false, error: "not_found_or_already_final" };
      }
      const g = result.rows[0];
      return {
        success: true,
        goalId: g.id,
        name: g.name,
        message: `❌ Meta "${g.name}" cancelada`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * create_budget
 */
export const createBudget: ToolDefinition = {
  name: "create_budget",
  description: "Cria um orçamento por categoria (limite de gasto).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    categoryId: Type.String(),
    name: Type.String(),
    amountCents: Type.Number({ minimum: 1 }),
    period: Type.Union([
      Type.Literal("weekly"),
      Type.Literal("monthly"),
      Type.Literal("quarterly"),
      Type.Literal("yearly"),
    ]),
    startDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    endDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })),
    alertThreshold: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    rollover: Type.Optional(Type.Boolean()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const alertThreshold = params.alertThreshold || 80;

      // Check if already exists
      const exists = await pool.query(
        `SELECT id FROM budgets
         WHERE household_id = $1 AND category_id = $2 AND period = $3 AND start_date = $4::date`,
        [householdId, params.categoryId, params.period, params.startDate]
      );
      if (exists.rows.length > 0) {
        return {
          success: false,
          error: "budget_exists",
          message: `Já existe orçamento para essa categoria/período`,
          existingId: exists.rows[0].id,
        };
      }

      const result = await pool.query<{ rows: Budget[] }>(
        `INSERT INTO budgets
         (household_id, category_id, name, amount_cents, period,
          start_date, end_date, rollover, alert_threshold)
         VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9)
         RETURNING *`,
        [
          householdId, params.categoryId, params.name, params.amountCents, params.period,
          params.startDate, params.endDate || null, params.rollover || false, alertThreshold,
        ]
      );

      const b = result.rows[0];
      return {
        success: true,
        budgetId: b.id,
        name: b.name,
        amountCents: parseInt(b.amount_cents, 10),
        period: b.period,
        alertThreshold: b.alert_threshold,
        message: `✅ Orçamento "${params.name}" criado: ${fmt(params.amountCents)}/${params.period === "monthly" ? "mês" : params.period}`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * list_budgets
 */
export const listBudgets: ToolDefinition = {
  name: "list_budgets",
  description: "Lista orçamentos com status atual (gasto vs limite).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    status: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const filters: string[] = ["b.household_id = $1"];
      const values: any[] = [householdId];
      if (params.status) {
        values.push(params.status);
        filters.push(`b.status = $${values.length}`);
      }

      const result = await pool.query<{ rows: Budget[] }>(
        `SELECT b.* FROM budgets b WHERE ${filters.join(" AND ")} ORDER BY b.name`,
        values
      );

      const items: any[] = [];
      for (const b of result.rows) {
        const status = await computeBudgetStatus(pool, b);
        items.push({
          id: b.id,
          name: b.name,
          categoryId: b.category_id,
          amountCents: parseInt(b.amount_cents, 10),
          spentCents: status.spentCents,
          remainingCents: status.remainingCents,
          percentUsed: status.percentUsed,
          status: status.status,
          period: b.period,
          daysRemaining: status.daysRemaining,
        });
      }

      const lines: string[] = [];
      lines.push(`💰 ${items.length} orçamento(s):\n`);
      for (const i of items) {
        const statusIcon: Record<string, string> = {
          ok: "✅", warning: "⚠️", critical: "🔴", exceeded: "🚨",
        };
        lines.push(`${statusIcon[i.status] || "?"} ${i.name} (${i.period})`);
        lines.push(`   ${fmt(i.spentCents)} / ${fmt(i.amountCents)} (${i.percentUsed.toFixed(1)}%)`);
        if (i.status !== "ok") {
          lines.push(`   Restante: ${fmt(i.remainingCents)} | ${i.daysRemaining} dia(s) restantes`);
        }
        lines.push("");
      }

      return {
        success: true,
        total: items.length,
        items,
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * check_budgets
 *
 * Retorna status de todos os orçamentos ativos.
 * Identifica quais estão em warning/critical/exceeded.
 * Ideal para usar em notificações.
 */
export const checkBudgets: ToolDefinition = {
  name: "check_budgets",
  description: "Verifica status de todos os orçamentos (alertas).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const statuses = await getAllBudgetStatuses(pool, householdId);

      const alerts = statuses.filter((s) => s.status !== "ok");
      const totalCents = statuses.reduce((s, x) => s + x.amountCents, 0);
      const spentCents = statuses.reduce((s, x) => s + x.spentCents, 0);

      const lines: string[] = [];
      if (alerts.length === 0) {
        lines.push(`✅ Todos os ${statuses.length} orçamentos dentro do limite`);
        lines.push(`   Total: ${fmt(spentCents)} / ${fmt(totalCents)} (${((spentCents/totalCents)*100).toFixed(1)}%)`);
      } else {
        lines.push(`🚨 ${alerts.length} orçamento(s) com alerta:\n`);
        for (const s of alerts) {
          const icon = s.status === "exceeded" ? "🚨" : s.status === "critical" ? "🔴" : "⚠️";
          lines.push(`${icon} ${s.name} (${s.categoryName || "?"})`);
          lines.push(`   ${fmt(s.spentCents)} / ${fmt(s.amountCents)} (${s.percentUsed.toFixed(1)}%)`);
          lines.push(`   Restante: ${fmt(s.remainingCents)} | Diário: ${fmt(s.dailyAllowance)}/dia por ${s.daysRemaining}d`);
          lines.push("");
        }
      }

      return {
        success: true,
        totalBudgets: statuses.length,
        alertCount: alerts.length,
        totalBudgetCents: totalCents,
        totalSpentCents: spentCents,
        alerts: alerts.map((s) => ({
          budgetId: s.budgetId,
          name: s.name,
          categoryName: s.categoryName,
          status: s.status,
          percentUsed: s.percentUsed,
          amountCents: s.amountCents,
          spentCents: s.spentCents,
          remainingCents: s.remainingCents,
          dailyAllowance: s.dailyAllowance,
          daysRemaining: s.daysRemaining,
        })),
        message: lines.join("\n"),
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * refresh_goals
 */
export const refreshGoalsTool: ToolDefinition = {
  name: "refresh_goals",
  description: "Atualiza status de metas (achieved/failed).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const result = await refreshGoals(pool, householdId);
      return {
        success: true,
        checked: result.checked,
        achieved: result.achieved,
        atRisk: result.atRisk,
        message: `🔄 ${result.checked} metas verificadas: ${result.achieved} atingida(s), ${result.atRisk} falhada(s)`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

// ============================================================
// TOOLS: Budget Trends + Adjustment Suggestions
// ============================================================

/**
 * budget_trends
 */
export const budgetTrendsTool: ToolDefinition = {
  name: "budget_trends",
  description: "Mostra gasto vs orçamento ao longo dos últimos meses (tendência).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    budgetId: Type.String({ description: "ID do orçamento" }),
    monthsBack: Type.Optional(Type.Integer({ minimum: 1, maximum: 12, default: 3 })),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const monthsBack = params.monthsBack || 3;

      const bResult = await pool.query<{ rows: Budget[] }>(
        `SELECT * FROM budgets WHERE id = $1 AND household_id = $2`,
        [params.budgetId, householdId]
      );
      if (!bResult.rows.length) {
        return { success: false, error: "not_found", message: "Orçamento não encontrado" };
      }

      const trends = await getBudgetTrends(pool, bResult.rows[0], monthsBack);
      return {
        success: true,
        budgetId: trends.budgetId,
        name: trends.name,
        categoryName: trends.categoryName,
        period: trends.period,
        months: trends.months,
        avgSpentCents: trends.avgSpentCents,
        avgPercentUsed: trends.avgPercentUsed,
        trend: trends.trend,
        message: trends.formatted,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * suggest_budget_adjustment
 */
export const suggestBudgetAdjustmentTool: ToolDefinition = {
  name: "suggest_budget_adjustment",
  description: "Sugere ajuste de orçamento baseado na média de gastos dos últimos meses.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    budgetId: Type.String({ description: "ID do orçamento" }),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;

      const bResult = await pool.query<{ rows: Budget[] }>(
        `SELECT * FROM budgets WHERE id = $1 AND household_id = $2`,
        [params.budgetId, householdId]
      );
      if (!bResult.rows.length) {
        return { success: false, error: "not_found", message: "Orçamento não encontrado" };
      }

      const suggestion = await getBudgetAdjustmentSuggestion(pool, bResult.rows[0]);
      return {
        success: true,
        budgetId: suggestion.budgetId,
        name: suggestion.name,
        categoryName: suggestion.categoryName,
        currentLimitCents: suggestion.currentLimitCents,
        suggestedLimitCents: suggestion.suggestedLimitCents,
        avgSpentCents: suggestion.avgSpentCents,
        action: suggestion.action,
        percentChange: suggestion.percentChange,
        reason: suggestion.reason,
        message: suggestion.formatted,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};

/**
 * update_budget
 */
export const updateBudgetTool: ToolDefinition = {
  name: "update_budget",
  description: "Atualiza limite ou configurações de um orçamento existente.",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    budgetId: Type.String({ description: "ID do orçamento" }),
    name: Type.Optional(Type.String()),
    amountCents: Type.Optional(Type.Number({ minimum: 1 })),
    alertThreshold: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    rollover: Type.Optional(Type.Boolean()),
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;

      if (params.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(params.name); }
      if (params.amountCents !== undefined) { sets.push(`amount_cents = $${idx++}`); vals.push(params.amountCents); }
      if (params.alertThreshold !== undefined) { sets.push(`alert_threshold = $${idx++}`); vals.push(params.alertThreshold); }
      if (params.rollover !== undefined) { sets.push(`rollover = $${idx++}`); vals.push(params.rollover); }

      if (sets.length === 0) {
        return { success: false, error: "no_changes", message: "Nenhum campo para atualizar" };
      }

      sets.push(`updated_at = NOW()`);
      vals.push(params.budgetId, householdId);

      const r = await pool.query(
        `UPDATE budgets SET ${sets.join(", ")} WHERE id = $${idx++} AND household_id = $${idx} RETURNING *`,
        vals
      );
      if (!r.rows.length) {
        return { success: false, error: "not_found", message: "Orçamento não encontrado" };
      }

      return {
        success: true,
        budgetId: r.rows[0].id,
        message: `✅ Orçamento "${r.rows[0].name}" atualizado`,
      };
    } catch (e: any) {
      return { success: false, error: "db_error", message: e.message };
    } finally {
      await pool.end();
    }
  },
};
