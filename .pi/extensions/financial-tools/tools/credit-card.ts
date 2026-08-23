/**
 * credit-card â€” Credit card statement management
 *
 * Handles:
 * - Credit card accounts (with closing_day, due_day, credit_limit)
 * - Purchases on credit cards (go to open statement)
 * - Statement lifecycle: open â†’ closed â†’ paid/partial/overdue
 * - Installments
 *
 * Statement logic:
 * - Closing day: when statement closes (no more purchases accepted)
 * - Due day: when payment is due
 * - Statement period: previous_closing_date+1 to current_closing_date
 * - Purchases between closing days go to the current statement
 * - Status transitions:
 *   - "open" â†’ "closed" (after closing_date, before due_date)
 *   - "closed" â†’ "paid" (full payment)
 *   - "closed" â†’ "partial" (partial payment)
 *   - "closed" â†’ "overdue" (after due_date without full payment)
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

export interface CreditCardInfo {
  accountId: string;
  closingDay: number;
  dueDay: number;
  creditLimitCents: number;
}

export interface Statement {
  id: string;
  accountId: string;
  cycleYearMonth: string;
  closingDate: string;
  dueDate: string;
  totalCents: number;
  paidCents: number;
  status: "open" | "closed" | "paid" | "partial" | "overdue" | "cancelled";
}

export interface StatementWithPurchases extends Statement {
  purchases: Array<{
    id: string;
    description: string;
    amountCents: number;
    date: string;
    installmentsTotal: number | null;
    installmentNumber: number | null;
  }>;
}

/**
 * Validate a day of month (1-31).
 */
export function isValidDay(day: number): boolean {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

/**
 * Get the closing date for a given purchase date and card config.
 * - If purchase_day <= closing_day: closing is current month on closing_day
 * - If purchase_day > closing_day: closing is next month on closing_day
 */
export function getClosingDate(
  purchaseDate: string,
  closingDay: number
): string {
  const d = new Date(purchaseDate + "T00:00:00.000Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-indexed
  
  let closingYear = year;
  let closingMonth = month;
  if (d.getUTCDate() > closingDay) {
    closingMonth += 1;
    if (closingMonth > 11) {
      closingMonth = 0;
      closingYear += 1;
    }
  }
  // Clamp day to last day of month if needed
  const lastDayOfMonth = new Date(Date.UTC(closingYear, closingMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(closingDay, lastDayOfMonth);
  return `${closingYear}-${String(closingMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
}

/**
 * Get the due date for a closing date.
 * Usually due day is the next month after closing, or same month but later.
 * Convention: due_date = closing_date + (due_day - closing_day) days,
 *   but if due_day < closing_day, due_date is next month.
 */
export function getDueDate(closingDate: string, dueDay: number): string {
  const d = new Date(closingDate + "T00:00:00.000Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const closingDay = d.getUTCDate();
  
  let dueYear = year;
  let dueMonth = month;
  if (dueDay <= closingDay) {
    dueMonth += 1;
    if (dueMonth > 11) {
      dueMonth = 0;
      dueYear += 1;
    }
  }
  const lastDayOfMonth = new Date(Date.UTC(dueYear, dueMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(dueDay, lastDayOfMonth);
  return `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
}

/**
 * Get the cycle year-month for a purchase (e.g., "2026-08" for purchases in August cycle).
 */
export function getCycleYearMonth(closingDate: string): string {
  return closingDate.slice(0, 7); // "YYYY-MM"
}

/**
 * Get or create the open statement for a credit card.
 * If a statement with the given cycle already exists, return it.
 * Otherwise, create a new one.
 */
export async function getOrCreateOpenStatement(
  pool: Pool,
  accountId: string,
  householdId: string,
  closingDate: string,
  dueDate: string
): Promise<Statement> {
  const cycle = getCycleYearMonth(closingDate);
  
  // Try to find existing
  const existing = await pool.query<Statement>(
    `SELECT id, account_id as "accountId", cycle_year_month as "cycleYearMonth",
            closing_date as "closingDate", due_date as "dueDate",
            total_cents as "totalCents", paid_cents as "paidCents", status
     FROM statements
     WHERE account_id = $1 AND cycle_year_month = $2`,
    [accountId, cycle]
  );
  
  if (existing.rows.length > 0) {
    return existing.rows[0];
  }
  
  // Create new
  const id = randomUUID();
  const result = await pool.query<Statement>(
    `INSERT INTO statements (id, household_id, account_id, cycle_year_month, closing_date, due_date, total_cents, paid_cents, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'open', NOW(), NOW())
     RETURNING id, account_id as "accountId", cycle_year_month as "cycleYearMonth",
               closing_date as "closingDate", due_date as "dueDate",
               total_cents as "totalCents", paid_cents as "paidCents", status`,
    [id, householdId, accountId, cycle, closingDate, dueDate]
  );
  
  return result.rows[0];
}

/**
 * Update statement status based on dates and payments.
 * - If paid_cents >= total_cents â†’ paid
 * - If paid_cents > 0 && paid_cents < total_cents â†’ partial
 * - If today > due_date && paid_cents < total_cents â†’ overdue
 * - If today > closing_date && paid_cents == 0 â†’ closed
 * - Otherwise â†’ open
 */
export function computeStatementStatus(
  statement: Statement,
  today: string
): Statement["status"] {
  if (statement.status === "cancelled") return "cancelled";
  if (statement.paidCents >= statement.totalCents) return "paid";
  if (statement.paidCents > 0 && today > statement.dueDate) return "overdue";
  if (statement.paidCents > 0) return "partial";
  if (today > statement.dueDate) return "overdue";
  if (today >= statement.closingDate) return "closed";
  return "open";
}

/**
 * Refresh statement status in the database based on current state.
 */
export async function refreshStatementStatus(
  pool: Pool,
  statementId: string,
  today: string
): Promise<Statement["status"]> {
  const result = await pool.query<Statement>(
    `SELECT id, account_id as "accountId", cycle_year_month as "cycleYearMonth",
            closing_date::text as "closingDate", due_date::text as "dueDate",
            total_cents as "totalCents", paid_cents as "paidCents", status
     FROM statements
     WHERE id = $1`,
    [statementId]
  );
  if (result.rows.length === 0) throw new Error("Statement not found");
  
  const newStatus = computeStatementStatus(result.rows[0], today);
  if (newStatus !== result.rows[0].status) {
    await pool.query(
      `UPDATE statements SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, statementId]
    );
  }
  return newStatus;
}

/**
 * Get credit card info from an account.
 */
export async function getCreditCardInfo(
  pool: Pool,
  accountId: string
): Promise<CreditCardInfo | null> {
  const result = await pool.query<{
    is_credit_card: boolean;
    credit_limit_cents: string | null;
    closing_day: number | null;
    due_day: number | null;
  }>(
    `SELECT is_credit_card, credit_limit_cents, closing_day, due_day
     FROM accounts WHERE id = $1 AND deleted_at IS NULL`,
    [accountId]
  );
  if (result.rows.length === 0 || !result.rows[0].is_credit_card) return null;
  return {
    accountId,
    closingDay: result.rows[0].closing_day!,
    dueDay: result.rows[0].due_day!,
    creditLimitCents: parseInt(result.rows[0].credit_limit_cents || "0", 10),
  };
}

/**
 * Get open statements (status = 'open' or 'closed') for an account.
 */
export async function listOpenStatements(
  pool: Pool,
  accountId: string
): Promise<Statement[]> {
  const result = await pool.query<Statement>(
    `SELECT id, account_id as "accountId", cycle_year_month as "cycleYearMonth",
            closing_date::text as "closingDate", due_date::text as "dueDate",
            total_cents as "totalCents", paid_cents as "paidCents", status
     FROM statements
     WHERE account_id = $1 AND status IN ('open', 'closed', 'partial')
     ORDER BY closing_date ASC`,
    [accountId]
  );
  return result.rows;
}

/**
 * Get overdue statements.
 */
export async function listOverdueStatements(
  pool: Pool,
  householdId: string,
  today: string
): Promise<Statement[]> {
  const result = await pool.query<Statement>(
    `SELECT id, account_id as "accountId", cycle_year_month as "cycleYearMonth",
            closing_date::text as "closingDate", due_date::text as "dueDate",
            total_cents as "totalCents", paid_cents as "paidCents", status
     FROM statements
     WHERE household_id = $1 AND status = 'overdue'
     ORDER BY due_date ASC`,
    [householdId]
  );
  return result.rows;
}

/**
 * Get all purchases in a statement.
 */
export async function getStatementPurchases(
  pool: Pool,
  statementId: string
): Promise<StatementWithPurchases["purchases"]> {
  const stmtResult = await pool.query<Statement>(
    `SELECT id, account_id as "accountId", cycle_year_month as "cycleYearMonth",
            closing_date::text as "closingDate", due_date::text as "dueDate",
            total_cents as "totalCents", paid_cents as "paidCents", status
     FROM statements WHERE id = $1`,
    [statementId]
  );
  if (stmtResult.rows.length === 0) return [];

  const purchases = await pool.query<{
    id: string;
    description: string;
    amount_cents: string;
    date: string;
    installments_total: number | null;
    installment_number: number | null;
  }>(
    `SELECT id, description, amount_cents, date::text, installments_total, installment_number
     FROM transactions
     WHERE statement_id = $1 AND deleted_at IS NULL
     ORDER BY date ASC, created_at ASC`,
    [statementId]
  );

  return purchases.rows.map((r) => ({
    id: r.id,
    description: r.description,
    amountCents: parseInt(r.amount_cents, 10),
    date: r.date,
    installmentsTotal: r.installments_total,
    installmentNumber: r.installment_number,
  }));
}

/**
 * Recalculate statement total from its purchases.
 */
export async function recalculateStatementTotal(
  pool: Pool,
  statementId: string
): Promise<number> {
  const result = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(amount_cents), 0) as total
     FROM transactions
     WHERE statement_id = $1 AND deleted_at IS NULL`,
    [statementId]
  );
  const total = parseInt(result.rows[0].total, 10);
  await pool.query(
    `UPDATE statements SET total_cents = $1, updated_at = NOW() WHERE id = $2`,
    [total, statementId]
  );
  return total;
}

/**
 * Format a statement for display.
 */
export function formatStatement(s: Statement, purchases?: StatementWithPurchases["purchases"]): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [];
  lines.push(`ðŸ“… Fatura ${s.cycleYearMonth} (${s.status})`);
  lines.push(`  Fechamento: ${s.closingDate}`);
  lines.push(`  Vencimento: ${s.dueDate}`);
  lines.push(`  Total: ${fmt(s.totalCents)} | Pago: ${fmt(s.paidCents)} | Saldo: ${fmt(s.totalCents - s.paidCents)}`);
  if (purchases && purchases.length > 0) {
    lines.push(`  Compras (${purchases.length}):`);
    for (const p of purchases) {
      const inst = p.installmentsTotal ? ` (${p.installmentNumber}/${p.installmentsTotal})` : "";
      lines.push(`    â€¢ ${p.date} ${p.description}${inst} â€” ${fmt(p.amountCents)}`);
    }
  }
  return lines.join("\n");
}
