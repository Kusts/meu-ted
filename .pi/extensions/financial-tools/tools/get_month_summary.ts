/**
 * get_month_summary — Pi tool
 */

import { Type } from "typebox";

async function query<T extends { rows: unknown[] }>(text: string, params?: unknown[]): Promise<T> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const r = await pool.query(text, params); return r as T; }
  finally { await pool.end(); }
}

function isUUID(s: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
function parseYearMonth(s: string) { return /^\d{4}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "-01")); }

export const getMonthSummaryTool = {
  name: "get_month_summary",
  label: "Monthly Summary",
  description: "Get income/expense totals and transaction count for a given year-month (YYYY-MM format).",
  parameters: Type.Object({
    householdId: Type.String(),
    yearMonth: Type.String({ description: "YYYY-MM format, e.g. 2026-06" }),
  }),

  async execute(_id: string, params: { householdId: string; yearMonth: string }, _sig: AbortSignal, onUpdate: ((u: { content: { type: "text"; text: string }[] }) => void) | undefined) {
    if (!isUUID(params.householdId)) throw new Error("householdId must be a valid UUID");
    if (!parseYearMonth(params.yearMonth)) throw new Error("yearMonth must be in YYYY-MM format");

    const [year, month] = params.yearMonth.split("-").map(Number);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const r = await query<{ rows: { kind: string; total: string }[] }>(
      `SELECT kind, COALESCE(SUM(amount_cents), 0) as total
       FROM transactions
       WHERE household_id = $1 AND date >= $2 AND date <= $3 AND deleted_at IS NULL
       GROUP BY kind`,
      [params.householdId, startDate, endDate]
    );

    let income = 0, expense = 0;
    for (const row of r.rows) {
      if (row.kind === "income") income = parseInt(row.total, 10);
      if (row.kind === "expense") expense = parseInt(row.total, 10);
    }

    const balance = income - expense;
    const fmt = (n: number) => `R$ ${(n / 100).toFixed(2)}`;
    const text = `📊 Resumo ${params.yearMonth}\nReceitas: ${fmt(income)}\nDespesas: ${fmt(expense)}\nSaldo: ${fmt(balance)}`;

    onUpdate?.({ content: [{ type: "text", text: "Calculando resumo..." }] });

    return {
        success: true,
        incomeCents: income,
        expenseCents: expense,
        balanceCents: balance,
        yearMonth: params.yearMonth,
 content: [{ type: "text", text }], details: { year_month: params.yearMonth, income_cents: income, expense_cents: expense, balance_cents: balance } };
  },
};