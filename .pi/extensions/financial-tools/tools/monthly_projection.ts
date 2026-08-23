/**
 * monthly_projection â€” ProjeÃ§Ã£o de contas a pagar no mÃªs
 *
 * Soma todas as contas a pagar que vencem no mÃªs,
 * agrupadas por categoria e por dia.
 *
 * Inclui:
 * - Recorrentes (prÃ³ximas ocorrÃªncias baseadas em template/last paid)
 * - One-time criadas
 *
 * Output:
 * - Total a pagar no mÃªs
 * - Breakdown por dia
 * - Breakdown por categoria
 * - Saldo disponÃ­vel apÃ³s pagar todas
 */

import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Pool } from "pg";

const HOUSEHOLD_DEFAULT = process.env.HOUSEHOLD_ID || "550e8400-e29b-41d4-a716-446655440000";
const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

export const monthlyProjection: ToolDefinition = {
  name: "monthly_projection",
  description: "Projeta todas as contas a pagar em um mÃªs (recorrentes + one-time).",
  parameters: Type.Object({
    householdId: Type.Optional(Type.String()),
    yearMonth: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}$" })),  // default: mÃªs atual
  }),
  execute: async (params: any) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const householdId = params.householdId || HOUSEHOLD_DEFAULT;
      const yearMonth = params.yearMonth || new Date().toISOString().slice(0, 7);

      // Get all accounts (pending + overdue) for the month
      const result = await pool.query<any>(
        `SELECT ap.*, a.name as account_name, c.name as category_name
         FROM accounts_payable ap
         LEFT JOIN accounts a ON a.id = ap.account_id
         LEFT JOIN categories c ON c.id = ap.category_id
         WHERE ap.household_id = $1
           AND ap.status IN ('pending', 'overdue')
           AND ap.deleted_at IS NULL
           AND TO_CHAR(ap.due_date, 'YYYY-MM') = $2
         ORDER BY ap.due_date ASC`,
        [householdId, yearMonth]
      );

      const totalCents = result.rows.reduce(
        (s, r) => s + parseInt(r.amount_cents, 10), 0
      );

      // By day
      const byDay = new Map<string, { count: number; cents: number; items: any[] }>();
      for (const r of result.rows) {
        const day = r.due_date.toISOString().slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, { count: 0, cents: 0, items: [] });
        const d = byDay.get(day)!;
        d.count += 1;
        d.cents += parseInt(r.amount_cents, 10);
        d.items.push({
          description: r.description,
          amountCents: parseInt(r.amount_cents, 10),
          category: r.category_name,
        });
      }

      // By category
      const byCategory = new Map<string, number>();
      for (const r of result.rows) {
        const cat = r.category_name || "Sem categoria";
        byCategory.set(cat, (byCategory.get(cat) || 0) + parseInt(r.amount_cents, 10));
      }

      // By status
      const overdueCents = result.rows
        .filter((r) => r.status === "overdue")
        .reduce((s, r) => s + parseInt(r.amount_cents, 10), 0);
      const pendingCents = totalCents - overdueCents;

      // Estimate income (last 3 months average)
      const incomeResult = await pool.query<{ total: string }>(
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
      const monthlyIncomeCents = parseInt(incomeResult.rows[0]?.total || "0", 10);

      const balanceAfter = monthlyIncomeCents - totalCents;
      const commitmentRatio = monthlyIncomeCents > 0 ? totalCents / monthlyIncomeCents : 0;

      // Format
      const lines: string[] = [];
      lines.push(`ðŸ“… ProjeÃ§Ã£o de contas a pagar: ${yearMonth}`);
      lines.push("");
      lines.push(`ðŸ’¸ Total a pagar: ${fmt(totalCents)}`);
      if (overdueCents > 0) {
        lines.push(`   ðŸš¨ Vencidas (de meses anteriores): ${fmt(overdueCents)}`);
        lines.push(`   ðŸ“… Pendentes deste mÃªs: ${fmt(pendingCents)}`);
      }
      lines.push("");
      if (byDay.size > 0) {
        lines.push(`ðŸ“† Por dia de vencimento:`);
        const sortedDays = Array.from(byDay.keys()).sort();
        for (const day of sortedDays) {
          const d = byDay.get(day)!;
          lines.push(`   ${day}: ${fmt(d.cents)} (${d.count} conta${d.count > 1 ? "s" : ""})`);
        }
        lines.push("");
      }
      if (byCategory.size > 0) {
        lines.push(`ðŸ·ï¸  Por categoria:`);
        const sortedCats = Array.from(byCategory.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        for (const [cat, cents] of sortedCats) {
          lines.push(`   ${cat}: ${fmt(cents)}`);
        }
        lines.push("");
      }
      if (monthlyIncomeCents > 0) {
        lines.push(`ðŸ’° Renda mensal (mÃ©dia 3 meses): ${fmt(monthlyIncomeCents)}`);
        lines.push(`ðŸ“Š Comprometimento: ${(commitmentRatio * 100).toFixed(1)}%`);
        const balIcon = balanceAfter >= 0 ? "âœ…" : "âš ï¸";
        lines.push(`${balIcon} Saldo apÃ³s pagar todas: ${fmt(balanceAfter)}`);
      }

      return {
        success: true,
        yearMonth,
        totalCents,
        overdueCents,
        pendingCents,
        accountCount: result.rows.length,
        monthlyIncomeCents,
        balanceAfterCents: balanceAfter,
        commitmentRatio,
        byDay: Array.from(byDay.entries()).map(([day, v]) => ({ day, ...v })),
        byCategory: Array.from(byCategory.entries()).map(([category, cents]) => ({ category, cents })),
        items: result.rows.map((r) => ({
          id: r.id,
          description: r.description,
          amountCents: parseInt(r.amount_cents, 10),
          dueDate: r.due_date.toISOString().slice(0, 10),
          status: r.status,
          category: r.category_name,
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
