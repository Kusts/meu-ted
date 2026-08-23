/**
 * card-insights â€” Generate insights for credit card usage
 *
 * - Compare statement month vs previous month (% change, absolute change)
 * - Top categories per card
 * - Total spend in card vs other payment methods
 * - Overdue alert
 */

import type { Pool } from "pg";

export interface CardInsight {
  cardId: string;
  cardName: string;
  currentMonth: {
    cycle: string;
    totalCents: number;
    purchaseCount: number;
  };
  previousMonth: {
    cycle: string;
    totalCents: number;
    purchaseCount: number;
  };
  change: {
    absoluteCents: number;
    percent: number | null;  // null if no previous data
  };
}

export interface CategoryInsight {
  cardId: string;
  cardName: string;
  category: string;
  totalCents: number;
  purchaseCount: number;
}

/**
 * Compare current month vs previous month for all credit cards.
 */
export async function getMonthOverMonthInsights(
  pool: Pool,
  householdId: string,
  currentYearMonth: string  // e.g. "2026-08"
): Promise<CardInsight[]> {
  // Compute previous month
  const [year, month] = currentYearMonth.split("-").map(Number);
  const prevDate = new Date(Date.UTC(year, month - 2, 1));
  const prevYearMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;

  // Get statements for both months
  const result = await pool.query(
    `SELECT s.account_id, a.name as account_name, s.cycle_year_month,
            s.total_cents,
            (SELECT COUNT(*) FROM transactions t
             WHERE t.statement_id = s.id AND t.deleted_at IS NULL) as purchase_count
     FROM statements s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.household_id = $1
       AND s.cycle_year_month IN ($2, $3)
     ORDER BY a.name, s.cycle_year_month`,
    [householdId, currentYearMonth, prevYearMonth]
  ) as unknown as { rows: Array<{
    account_id: string;
    account_name: string;
    cycle_year_month: string;
    total_cents: string;
    purchase_count: string;
  }> };

  // Group by card
  const cardMap = new Map<string, CardInsight>();
  for (const row of result.rows) {
    if (!cardMap.has(row.account_id)) {
      cardMap.set(row.account_id, {
        cardId: row.account_id,
        cardName: row.account_name,
        currentMonth: { cycle: currentYearMonth, totalCents: 0, purchaseCount: 0 },
        previousMonth: { cycle: prevYearMonth, totalCents: 0, purchaseCount: 0 },
        change: { absoluteCents: 0, percent: null },
      });
    }
    const insight = cardMap.get(row.account_id)!;
    if (row.cycle_year_month === currentYearMonth) {
      insight.currentMonth.totalCents = parseInt(row.total_cents, 10);
      insight.currentMonth.purchaseCount = parseInt(row.purchase_count, 10);
    } else {
      insight.previousMonth.totalCents = parseInt(row.total_cents, 10);
      insight.previousMonth.purchaseCount = parseInt(row.purchase_count, 10);
    }
  }

  // Calculate changes
  for (const insight of cardMap.values()) {
    const curr = insight.currentMonth.totalCents;
    const prev = insight.previousMonth.totalCents;
    insight.change.absoluteCents = curr - prev;
    insight.change.percent = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
  }

  return Array.from(cardMap.values());
}

/**
 * Get top categories for each card in a given month.
 */
export async function getTopCategoriesByCard(
  pool: Pool,
  householdId: string,
  yearMonth: string,
  limit: number = 5
): Promise<CategoryInsight[]> {
  const result = await pool.query(
    `SELECT t.from_account_id as account_id, a.name as account_name,
            c.name as category_name,
            SUM(t.amount_cents) as total,
            COUNT(*) as purchase_count
     FROM transactions t
     JOIN accounts a ON a.id = t.from_account_id
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.household_id = $1
       AND t.is_credit_card_purchase = true
       AND t.deleted_at IS NULL
       AND t.date::text LIKE $2 || '%'
     GROUP BY t.from_account_id, a.name, c.name
     ORDER BY SUM(t.amount_cents) DESC
     LIMIT $3`,
    [householdId, yearMonth, limit * 3]
  ) as unknown as { rows: Array<{
    account_id: string;
    account_name: string;
    category_name: string;
    total: string;
    purchase_count: string;
  }> };

  // Group by card, keep top N
  const cardMap = new Map<string, CategoryInsight[]>();
  for (const row of result.rows) {
    if (!cardMap.has(row.account_id)) {
      cardMap.set(row.account_id, []);
    }
    const arr = cardMap.get(row.account_id)!;
    if (arr.length < limit) {
      arr.push({
        cardId: row.account_id,
        cardName: row.account_name,
        category: row.category_name || "Sem categoria",
        totalCents: parseInt(row.total, 10),
        purchaseCount: parseInt(row.purchase_count, 10),
      });
    }
  }

  return Array.from(cardMap.values()).flat();
}

/**
 * Get total spent in credit cards vs other payment methods.
 */
export async function getCardVsOtherPayment(
  pool: Pool,
  householdId: string,
  yearMonth: string
): Promise<{
  cardTotalCents: number;
  otherTotalCents: number;
  cardPercent: number;
}> {
  const result = await pool.query(
    `SELECT COALESCE(t.is_credit_card_purchase, false) as is_card,
            SUM(t.amount_cents) as total
     FROM transactions t
     WHERE t.household_id = $1
       AND t.kind = 'expense'
       AND t.deleted_at IS NULL
       AND t.date::text LIKE $2 || '%'
     GROUP BY COALESCE(t.is_credit_card_purchase, false)`,
    [householdId, yearMonth]
  ) as unknown as { rows: Array<{ is_card: boolean; total: string }> };

  let cardTotal = 0;
  let otherTotal = 0;
  for (const row of result.rows) {
    const t = parseInt(row.total, 10);
    if (row.is_card) cardTotal = t;
    else otherTotal = t;
  }
  const grandTotal = cardTotal + otherTotal;
  return {
    cardTotalCents: cardTotal,
    otherTotalCents: otherTotal,
    cardPercent: grandTotal > 0 ? Math.round((cardTotal / grandTotal) * 100) : 0,
  };
}

/**
 * Get total overdue amount across all cards.
 */
export async function getTotalOverdue(pool: Pool, householdId: string): Promise<{
  count: number;
  totalCents: number;
}> {
  const result = await pool.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_cents - paid_cents), 0) as total
     FROM statements
     WHERE household_id = $1 AND status = 'overdue'`,
    [householdId]
  ) as unknown as { rows: Array<{ count: string; total: string }> };
  return {
    count: parseInt(result.rows[0].count, 10),
    totalCents: parseInt(result.rows[0].total, 10),
  };
}

/**
 * Format insights for display.
 */
export function formatInsights(insights: CardInsight[]): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [];
  lines.push(`ðŸ“Š ComparaÃ§Ã£o mÃªs a mÃªs:`);
  for (const i of insights) {
    const arrow = i.change.absoluteCents > 0 ? "ðŸ“ˆ" : i.change.absoluteCents < 0 ? "ðŸ“‰" : "âž¡ï¸";
    const pctStr = i.change.percent !== null ? ` (${i.change.percent > 0 ? "+" : ""}${i.change.percent}%)` : " (sem histÃ³rico)";
    lines.push(`\n  ${arrow} ${i.cardName}`);
    lines.push(`     ${i.currentMonth.cycle}: ${fmt(i.currentMonth.totalCents)} (${i.currentMonth.purchaseCount} compras)`);
    lines.push(`     ${i.previousMonth.cycle}: ${fmt(i.previousMonth.totalCents)} (${i.previousMonth.purchaseCount} compras)`);
    lines.push(`     VariaÃ§Ã£o: ${i.change.absoluteCents > 0 ? "+" : ""}${fmt(i.change.absoluteCents)}${pctStr}`);
  }
  return lines.join("\n");
}

export function formatTopCategories(insights: CategoryInsight[]): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [`ðŸ·ï¸ Top categorias por cartÃ£o:`];
  let currentCard = "";
  for (const i of insights) {
    if (i.cardName !== currentCard) {
      lines.push(`\n  ${i.cardName}:`);
      currentCard = i.cardName;
    }
    lines.push(`     â€¢ ${i.category}: ${fmt(i.totalCents)} (${i.purchaseCount}x)`);
  }
  return lines.join("\n");
}
