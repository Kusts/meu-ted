/**
 * get_month_summary — Runtime implementation
 * Read-only tool: aggregates transactions by month, no side effects.
 *
 * ARCHITECTURAL NOTE:
 * Standalone async function (NOT a Pi ToolDefinition).
 * See .pi/extensions/financial-tools/tools/get_month_summary.ts for Pi version.
 * SQL is identical — this version exists for scripts/reminder.ts (outside Pi context).
 *
 * Aggregates:
 * - total_income_cents: SUM(amount_cents) WHERE kind='income' AND date in month
 * - total_expense_cents: SUM(amount_cents) WHERE kind='expense' AND date in month
 * - net_balance_cents: income - expense
 * - transaction_count: COUNT of all non-deleted transactions
 *
 * Transfers are excluded (net zero for household cash flow)
 */

import { query } from '../db.js';
import type { GetMonthSummaryResult } from '../types.js';
import { validateUUID } from '../errors.js';

interface MonthAggregate {
  total_income: string | null;
  total_expense: string | null;
  transaction_count: string;
}

const EMPTY_SUMMARY = {
  total_income_cents: 0,
  total_expense_cents: 0,
  net_balance_cents: 0,
  transaction_count: 0,
};

export async function getMonthSummary(
  householdId: string,
  year: number,
  month: number
): Promise<GetMonthSummaryResult> {
  // Validate month range
  if (month < 1 || month > 12) {
    return { success: false, error: 'Month must be between 1 and 12', month: '', ...EMPTY_SUMMARY };
  }

  // Validate year range
  if (year < 2000 || year > 2100) {
    return { success: false, error: 'Year must be between 2000 and 2100', month: '', ...EMPTY_SUMMARY };
  }

  try {
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error', month: '', ...EMPTY_SUMMARY };
  }

  const monthStr = `${year.toString()}-${month.toString().padStart(2, '0')}`;

  try {
    const result = await query<MonthAggregate>(
      `SELECT
        COALESCE(SUM(CASE WHEN kind = 'income' THEN amount_cents ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount_cents ELSE 0 END), 0) as total_expense,
        COUNT(*) as transaction_count
       FROM transactions
       WHERE household_id = $1
         AND deleted_at IS NULL
         AND date >= $2::date
         AND date < ($2::date + INTERVAL '1 month')`,
      [householdId, `${year}-${month.toString().padStart(2, '0')}-01`]
    );

    const agg = result.rows[0];
    const totalIncome = parseInt(String(agg.total_income), 10);
    const totalExpense = parseInt(String(agg.total_expense), 10);
    const count = parseInt(String(agg.transaction_count), 10);

    return {
      success: true,
      month: monthStr,
      total_income_cents: totalIncome,
      total_expense_cents: totalExpense,
      net_balance_cents: totalIncome - totalExpense,
      transaction_count: count,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message,
      month: monthStr,
      ...EMPTY_SUMMARY,
    };
  }
}