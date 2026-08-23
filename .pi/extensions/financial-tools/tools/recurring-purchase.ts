/**
 * recurring-purchase â€” Recurring monthly purchases (subscriptions, etc.)
 *
 * Represents a recurring charge that should be posted every month
 * (or N months). When the user confirms, it creates a transaction
 * for the current month and schedules the next occurrence.
 *
 * Examples:
 * - Netflix: R$ 55.90 / month
 * - Spotify: R$ 21.90 / month
 * - Aluguel: R$ 1500 / month
 * - Academia: R$ 99.90 / month
 *
 * Lifecycle:
 *   "active" â†’ posts every cycle
 *   "paused" â†’ does not post
 *   "cancelled" â†’ terminated, history preserved
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";

export interface RecurringPurchase {
  id: string;
  householdId: string;
  accountId: string;
  categoryId: string | null;
  description: string;
  amountCents: number;
  frequency: "monthly" | "quarterly" | "yearly";
  startDate: string;  // YYYY-MM-DD
  endDate: string | null;  // null = indefinite
  lastPostedDate: string | null;  // last cycle posted
  nextDueDate: string;  // next cycle to post
  status: "active" | "paused" | "cancelled";
  sourceMessageId: string | null;
  createdAt: string;
}

/**
 * Compute the next due date from a previous date and frequency.
 */
export function computeNextDueDate(
  fromDate: string,
  frequency: "monthly" | "quarterly" | "yearly"
): string {
  const d = new Date(fromDate + "T00:00:00.000Z");
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  let newYear = year;
  let newMonth = month;
  if (frequency === "monthly") newMonth += 1;
  else if (frequency === "quarterly") newMonth += 3;
  else if (frequency === "yearly") newMonth += 12;

  if (newMonth > 11) {
    const yearsToAdd = Math.floor(newMonth / 12);
    newYear += yearsToAdd;
    newMonth = newMonth % 12;
  }

  // Handle end-of-month (e.g. Jan 31 + 1 month = Feb 28)
  const lastDayOfMonth = new Date(Date.UTC(newYear, newMonth + 1, 0)).getUTCDate();
  const finalDay = Math.min(day, lastDayOfMonth);
  return `${newYear}-${String(newMonth + 1).padStart(2, "0")}-${String(finalDay).padStart(2, "0")}`;
}

/**
 * Check if a recurring purchase is due (today >= nextDueDate).
 */
export function isDue(rp: RecurringPurchase, today: string): boolean {
  if (rp.status !== "active") return false;
  if (rp.endDate && today > rp.endDate) return false;
  return today >= rp.nextDueDate;
}

/**
 * Get all due recurring purchases for a household.
 */
export async function getDueRecurringPurchases(
  pool: Pool,
  householdId: string,
  today: string
): Promise<RecurringPurchase[]> {
  const result = await pool.query<RecurringPurchase>(
    `SELECT id, household_id as "householdId", account_id as "accountId",
            category_id as "categoryId", description, amount_cents as "amountCents",
            frequency, start_date::text as "startDate",
            end_date::text as "endDate", last_posted_date::text as "lastPostedDate",
            next_due_date::text as "nextDueDate", status,
            source_message_id as "sourceMessageId", created_at::text as "createdAt"
     FROM recurring_purchases
     WHERE household_id = $1
       AND status = 'active'
       AND next_due_date <= $2
       AND (end_date IS NULL OR end_date >= $2)
     ORDER BY next_due_date ASC`,
    [householdId, today]
  );
  return result.rows;
}

/**
 * Mark a recurring purchase as posted and advance next_due_date.
 */
export async function markRecurringPosted(
  pool: Pool,
  id: string,
  today: string
): Promise<void> {
  const rp = await pool.query<RecurringPurchase>(
    `SELECT id, household_id as "householdId", account_id as "accountId",
            category_id as "categoryId", description, amount_cents as "amountCents",
            frequency, start_date::text as "startDate",
            end_date::text as "endDate", last_posted_date::text as "lastPostedDate",
            next_due_date::text as "nextDueDate", status,
            source_message_id as "sourceMessageId", created_at::text as "createdAt"
     FROM recurring_purchases WHERE id = $1`,
    [id]
  );
  if (rp.rows.length === 0) throw new Error("Recurring purchase not found");
  const r = rp.rows[0];
  const nextDue = computeNextDueDate(today, r.frequency);
  await pool.query(
    `UPDATE recurring_purchases
     SET last_posted_date = $1, next_due_date = $2, updated_at = NOW()
     WHERE id = $3`,
    [today, nextDue, id]
  );
}

/**
 * Get monthly total of active recurring purchases.
 */
export async function getMonthlyRecurringTotal(
  pool: Pool,
  householdId: string
): Promise<number> {
  const result = await pool.query<{ amount_cents: string; frequency: string }>(
    `SELECT amount_cents, frequency FROM recurring_purchases
     WHERE household_id = $1 AND status = 'active'`,
    [householdId]
  );
  let total = 0;
  for (const row of result.rows) {
    const amt = parseInt(row.amount_cents, 10);
    if (row.frequency === "monthly") total += amt;
    else if (row.frequency === "quarterly") total += amt / 3;
    else if (row.frequency === "yearly") total += amt / 12;
  }
  return Math.round(total);
}

/**
 * Format a list of recurring purchases.
 */
export function formatRecurringList(rps: RecurringPurchase[]): string {
  if (rps.length === 0) return "Nenhuma recorrÃªncia ativa";
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [`ðŸ” ${rps.length} assinatura(Ãµes) ativa(s):`];
  for (const rp of rps) {
    const icon = rp.status === "paused" ? "â¸ï¸" : "ðŸ”„";
    const freqLabel: Record<string, string> = {
      monthly: "/mÃªs",
      quarterly: "/trim",
      yearly: "/ano",
    };
    lines.push(`  ${icon} ${rp.description}: ${fmt(rp.amountCents)} ${freqLabel[rp.frequency]}`);
    lines.push(`     PrÃ³x: ${rp.nextDueDate}${rp.lastPostedDate ? ` (Ãºltimo: ${rp.lastPostedDate})` : ""}`);
  }
  return lines.join("\n");
}
