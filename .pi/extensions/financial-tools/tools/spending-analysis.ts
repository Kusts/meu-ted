/**
 * spending-analysis â€” Comparative spending analysis
 *
 * - Compare user's spending vs reference (own history, average, period)
 * - Anomalies: detect unusual spikes
 * - Trends: category momentum
 * - Benchmark: how much of income goes to each category
 */

import type { Pool } from "pg";

export interface CategorySpending {
  category: string;
  totalCents: number;
  transactionCount: number;
}

export interface CategoryComparison {
  category: string;
  currentCents: number;
  previousCents: number;
  absoluteChange: number;
  percentChange: number | null;  // null if no previous
  trend: "up" | "down" | "stable" | "new" | "gone";
}

export interface SpendingInsight {
  type: "high_spend" | "anomaly" | "trend_up" | "trend_down" | "category_gone" | "new_category";
  severity: "info" | "warning" | "alert";
  category: string;
  message: string;
  currentCents?: number;
  previousCents?: number;
  percentChange?: number;
}

/**
 * Compare category spending: current month vs previous months (3-month average).
 */
export async function compareToAverage(
  pool: Pool,
  householdId: string,
  yearMonth: string,
  lookbackMonths: number = 3
): Promise<{ comparisons: CategoryComparison[]; insights: SpendingInsight[] }> {
  // Get current month spending by category
  const [year, month] = yearMonth.split("-").map(Number);
  const currentStart = `${yearMonth}-01`;
  const currentEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  // Get previous N months range
  const prevStart = new Date(Date.UTC(year, month - lookbackMonths, 1));
  const prevStartStr = `${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, "0")}-01`;

  // Current month
  const currentResult = await pool.query<{ category: string; total: string; count: string }>(
    `SELECT COALESCE(c.name, 'Sem categoria') as category,
            SUM(t.amount_cents) as total,
            COUNT(*) as count
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.household_id = $1
       AND t.kind = 'expense'
       AND t.deleted_at IS NULL
       AND t.date BETWEEN $2 AND $3
     GROUP BY c.name`,
    [householdId, currentStart, currentEnd]
  );

  // Previous months
  const prevResult = await pool.query<{ category: string; total: string }>(
    `SELECT COALESCE(c.name, 'Sem categoria') as category,
            SUM(t.amount_cents) as total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.household_id = $1
       AND t.kind = 'expense'
       AND t.deleted_at IS NULL
       AND t.date BETWEEN $2 AND $3
     GROUP BY c.name`,
    [householdId, prevStartStr, currentStart]
  );

  // Aggregate previous: per category, sum across N months
  const prevByCategory = new Map<string, number>();
  for (const r of prevResult.rows) {
    prevByCategory.set(r.category, (prevByCategory.get(r.category) || 0) + parseInt(r.total, 10));
  }

  const comparisons: CategoryComparison[] = [];
  const insights: SpendingInsight[] = [];

  // Process each current category
  for (const cur of currentResult.rows) {
    const currentCents = parseInt(cur.total, 10);
    const totalPrev = prevByCategory.get(cur.category) || 0;
    const avgPrev = totalPrev / lookbackMonths;
    const absChange = currentCents - avgPrev;
    const pct = avgPrev > 0 ? Math.round((absChange / avgPrev) * 100) : null;

    let trend: CategoryComparison["trend"];
    if (totalPrev === 0) trend = "new";
    else if (pct !== null && pct > 20) trend = "up";
    else if (pct !== null && pct < -20) trend = "down";
    else trend = "stable";

    comparisons.push({
      category: cur.category,
      currentCents,
      previousCents: Math.round(avgPrev),
      absoluteChange: Math.round(absChange),
      percentChange: pct,
      trend,
    });

    // Generate insights
    if (trend === "up" && pct !== null && pct > 50) {
      insights.push({
        type: "trend_up",
        severity: pct > 100 ? "alert" : "warning",
        category: cur.category,
        message: `ðŸ“ˆ ${cur.category}: +${pct}% vs mÃ©dia dos Ãºltimos ${lookbackMonths} meses`,
        currentCents,
        previousCents: Math.round(avgPrev),
        percentChange: pct,
      });
    } else if (trend === "down" && pct !== null && pct < -30) {
      insights.push({
        type: "trend_down",
        severity: "info",
        category: cur.category,
        message: `ðŸ“‰ ${cur.category}: ${pct}% vs mÃ©dia (economia!)`,
        currentCents,
        previousCents: Math.round(avgPrev),
        percentChange: pct,
      });
    } else if (trend === "new" && currentCents > 10000) {
      insights.push({
        type: "new_category",
        severity: "info",
        category: cur.category,
        message: `ðŸ†• Nova categoria detectada: ${cur.category} (R$ ${(currentCents / 100).toFixed(2)})`,
        currentCents,
      });
    }
  }

  // Detect categories that disappeared
  const currentCategories = new Set(currentResult.rows.map((r) => r.category));
  for (const [cat, total] of prevByCategory.entries()) {
    if (!currentCategories.has(cat) && total / lookbackMonths > 5000) {
      comparisons.push({
        category: cat,
        currentCents: 0,
        previousCents: Math.round(total / lookbackMonths),
        absoluteChange: -Math.round(total / lookbackMonths),
        percentChange: -100,
        trend: "gone",
      });
      insights.push({
        type: "category_gone",
        severity: "info",
        category: cat,
        message: `ðŸ‘‹ ${cat} nÃ£o teve gastos este mÃªs (mÃ©dia anterior R$ ${(total / lookbackMonths / 100).toFixed(2)})`,
        previousCents: Math.round(total / lookbackMonths),
      });
    }
  }

  // Sort comparisons by absolute change (biggest changes first)
  comparisons.sort((a, b) => Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange));

  return { comparisons, insights };
}

/**
 * Detect anomalies: single transactions much larger than category average.
 */
export async function detectAnomalies(
  pool: Pool,
  householdId: string,
  yearMonth: string
): Promise<SpendingInsight[]> {
  const result = await pool.query<{
    id: string;
    description: string;
    amount_cents: string;
    date: string;
    category: string;
  }>(
    `SELECT t.id, t.description, t.amount_cents, t.date::text,
            COALESCE(c.name, 'Sem categoria') as category
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.household_id = $1
       AND t.kind = 'expense'
       AND t.deleted_at IS NULL
       AND t.date::text LIKE $2 || '%'
     ORDER BY t.amount_cents DESC
     LIMIT 20`,
    [householdId, yearMonth]
  );

  const insights: SpendingInsight[] = [];
  for (const tx of result.rows) {
    const amount = parseInt(tx.amount_cents, 10);

    // Get category average from previous 3 months
    const [year, month] = yearMonth.split("-").map(Number);
    const prevStart = new Date(Date.UTC(year, month - 3, 1));
    const prevStartStr = `${prevStart.getUTCFullYear()}-${String(prevStart.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const avgResult = await pool.query<{ avg: string | null }>(
      `SELECT AVG(t.amount_cents) as avg
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.household_id = $1
         AND t.kind = 'expense'
         AND t.deleted_at IS NULL
         AND COALESCE(c.name, 'Sem categoria') = $2
         AND t.date BETWEEN $3 AND $4`,
      [householdId, tx.category, prevStartStr, `${yearMonth}-01`]
    );

    const avg = avgResult.rows[0]?.avg ? parseInt(avgResult.rows[0].avg, 10) : 0;
    if (avg > 0 && amount > avg * 2.5 && amount > 10000) {
      insights.push({
        type: "anomaly",
        severity: "warning",
        category: tx.category,
        message: `ðŸ” ${tx.description} (${tx.date}): R$ ${(amount / 100).toFixed(2)} â€” ${Math.round((amount / avg) * 100)}% da mÃ©dia para ${tx.category}`,
        currentCents: amount,
        previousCents: avg,
        percentChange: Math.round(((amount - avg) / avg) * 100),
      });
    }
  }

  return insights;
}

/**
 * Compute category share of total income (if income present).
 */
export async function getCategoryShareOfIncome(
  pool: Pool,
  householdId: string,
  yearMonth: string
): Promise<Array<{ category: string; totalCents: number; sharePercent: number }>> {
  const [year, month] = yearMonth.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  // Total income
  const incomeResult = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total
     FROM transactions
     WHERE household_id = $1 AND kind = 'income' AND deleted_at IS NULL
       AND date BETWEEN $2 AND $3`,
    [householdId, `${yearMonth}-01`, monthEnd]
  );
  const totalIncome = parseInt(incomeResult.rows[0].total, 10);

  if (totalIncome === 0) return [];

  // Top expense categories
  const catResult = await pool.query<{ category: string; total: string }>(
    `SELECT COALESCE(c.name, 'Sem categoria') as category,
            SUM(t.amount_cents) as total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.household_id = $1 AND t.kind = 'expense' AND t.deleted_at IS NULL
       AND t.date BETWEEN $2 AND $3
     GROUP BY c.name
     ORDER BY SUM(t.amount_cents) DESC
     LIMIT 10`,
    [householdId, `${yearMonth}-01`, monthEnd]
  );

  return catResult.rows.map((r) => ({
    category: r.category,
    totalCents: parseInt(r.total, 10),
    sharePercent: Math.round((parseInt(r.total, 10) / totalIncome) * 100),
  }));
}

/**
 * Format spending analysis for display.
 */
export function formatSpendingAnalysis(
  comparisons: CategoryComparison[],
  insights: SpendingInsight[]
): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [];

  if (insights.length > 0) {
    lines.push(`ðŸ’¡ ${insights.length} insight(s):`);
    for (const ins of insights) {
      const icon = ins.severity === "alert" ? "ðŸš¨" : ins.severity === "warning" ? "âš ï¸" : "â„¹ï¸";
      lines.push(`  ${icon} ${ins.message}`);
    }
    lines.push("");
  }

  lines.push(`ðŸ“Š ComparaÃ§Ã£o vs mÃ©dia:`);
  for (const c of comparisons.slice(0, 10)) {
    const arrow = c.trend === "up" ? "ðŸ“ˆ" : c.trend === "down" ? "ðŸ“‰" : c.trend === "new" ? "ðŸ†•" : c.trend === "gone" ? "ðŸ‘‹" : "âž¡ï¸";
    const pct = c.percentChange !== null ? ` (${c.percentChange > 0 ? "+" : ""}${c.percentChange}%)` : "";
    lines.push(`  ${arrow} ${c.category}: ${fmt(c.currentCents)} vs ${fmt(c.previousCents)}${pct}`);
  }
  return lines.join("\n");
}
