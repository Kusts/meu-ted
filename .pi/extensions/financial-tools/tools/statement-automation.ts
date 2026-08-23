/**
 * statement-automation â€” Automatic statement status transitions
 *
 * Handles automatic transition of statements:
 * - "open" â†’ "closed" (after closing_date, no more purchases accepted)
 * - Status refresh for all cards
 * - Returns summary of all changes
 *
 * Should be called periodically (e.g. on each TED interaction)
 * or via cron job.
 */

import type { Pool } from "pg";
import { refreshStatementStatus, type Statement } from "./credit-card";

export interface StatementChange {
  statementId: string;
  accountId: string;
  accountName: string;
  cycle: string;
  oldStatus: Statement["status"];
  newStatus: Statement["status"];
  totalCents: number;
  dueDate: string;
}

export interface AutomationResult {
  checkedAt: string;
  totalChecked: number;
  changes: StatementChange[];
  overdue: number;
  closed: number;
}

/**
 * Refresh all statements in a household and return any changes.
 * Should be called periodically.
 */
export async function refreshAllStatements(
  pool: Pool,
  householdId: string,
  today: string
): Promise<AutomationResult> {
  // Get all statements with their account names
  const result = await pool.query<{
    id: string;
    account_id: string;
    account_name: string;
    cycle_year_month: string;
    status: Statement["status"];
    total_cents: string;
    due_date: string;
  }>(
    `SELECT s.id, s.account_id, a.name as account_name,
            s.cycle_year_month, s.status, s.total_cents, s.due_date::text
     FROM statements s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.household_id = $1
       AND s.status NOT IN ('paid', 'cancelled')`,
    [householdId]
  );

  const changes: StatementChange[] = [];
  for (const row of result.rows) {
    const newStatus = await refreshStatementStatus(pool, row.id, today);
    if (newStatus !== row.status) {
      changes.push({
        statementId: row.id,
        accountId: row.account_id,
        accountName: row.account_name,
        cycle: row.cycle_year_month,
        oldStatus: row.status,
        newStatus,
        totalCents: parseInt(row.total_cents, 10),
        dueDate: row.due_date,
      });
    }
  }

  const overdue = changes.filter((c) => c.newStatus === "overdue").length;
  const closed = changes.filter((c) => c.newStatus === "closed").length;

  return {
    checkedAt: today,
    totalChecked: result.rows.length,
    changes,
    overdue,
    closed,
  };
}

/**
 * Get all statements that are currently "open" (still receiving purchases)
 * and whose closing_date is within the next N days.
 * Useful for proactive closure preparation.
 */
export async function getStatementsClosingSoon(
  pool: Pool,
  householdId: string,
  today: string,
  withinDays: number = 5
): Promise<Array<{
  statementId: string;
  accountName: string;
  cycle: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  daysUntilClose: number;
}>> {
  const result = await pool.query<{
    id: string;
    account_name: string;
    cycle_year_month: string;
    closing_date: string;
    due_date: string;
    total_cents: string;
  }>(
    `SELECT s.id, a.name as account_name, s.cycle_year_month,
            s.closing_date::text, s.due_date::text, s.total_cents
     FROM statements s
     JOIN accounts a ON a.id = s.account_id
     WHERE s.household_id = $1
       AND s.status = 'open'
       AND s.closing_date BETWEEN $2 AND $2::date + ($3 || ' days')::interval`,
    [householdId, today, withinDays]
  );

  const todayDate = new Date(today);
  return result.rows.map((r) => {
    const closingDate = new Date(r.closing_date);
    const daysUntilClose = Math.floor((closingDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    return {
      statementId: r.id,
      accountName: r.account_name,
      cycle: r.cycle_year_month,
      closingDate: r.closing_date,
      dueDate: r.due_date,
      totalCents: parseInt(r.total_cents, 10),
      daysUntilClose,
    };
  });
}

/**
 * Format changes for display.
 */
export function formatChanges(result: AutomationResult): string {
  if (result.changes.length === 0) {
    return `âœ… ${result.totalChecked} faturas verificadas, nenhuma mudanÃ§a.`;
  }
  const lines: string[] = [`ðŸ”„ ${result.changes.length} mudanÃ§a(s) em ${result.totalChecked} faturas:`];
  for (const c of result.changes) {
    const icon = c.newStatus === "overdue" ? "ðŸš¨" : c.newStatus === "closed" ? "ðŸ“…" : c.newStatus === "paid" ? "âœ…" : "â„¹ï¸";
    const fmt = `R$ ${(c.totalCents / 100).toFixed(2)}`;
    lines.push(`  ${icon} ${c.accountName} ${c.cycle}: ${c.oldStatus} â†’ ${c.newStatus} (${fmt}, vence ${c.dueDate})`);
  }
  if (result.overdue > 0) {
    lines.push(`\n  âš ï¸ ${result.overdue} fatura(s) agora atrasada(s)`);
  }
  return lines.join("\n");
}
