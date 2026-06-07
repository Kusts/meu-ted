/**
 * accounts-payable — Helpers para gestão de contas a pagar
 *
 * Conceitos:
 * - `recurring`: conta recorrente (luz, internet, aluguel) — próxima data é calculada
 * - `one_time`: conta avulsa (cartório, anuidade, IPVA)
 *
 * Status:
 * - pending: ainda não paga, data não passou
 * - overdue: data já passou e não foi paga
 * - paid: foi paga (paid_date preenchido)
 * - cancelled: conta foi cancelada (ex: cancelou assinatura)
 *
 * Lembretes:
 * - reminder_days_before: dias antes do vencimento para alertar
 * - last_reminder_sent_at: controla idempotência dos lembretes
 */

import type { Pool } from "pg";
import { addMonths } from "./installment-plan";

export interface AccountPayable {
  id: string;
  household_id: string;
  account_id: string;
  category_id: string | null;
  description: string;
  amount_cents: string;  // pg returns as string
  type: "recurring" | "one_time";
  frequency: "monthly" | "quarterly" | "yearly" | null;
  due_date: string;  // pg returns Date or string
  end_date: string | null;
  status: "pending" | "paid" | "overdue" | "cancelled";
  paid_date: string | null;
  paid_transaction_id: string | null;
  reminder_days_before: number;
  last_reminder_sent_at: string | null;
  notes: string | null;
}

export interface AccountPayableWithDetails extends AccountPayable {
  account_name: string;
  category_name: string | null;
  days_until_due: number;
  effective_status: "pending" | "paid" | "overdue" | "cancelled";
  needs_reminder: boolean;
}

/**
 * Compute effective status from status + due_date.
 * - cancelled is terminal
 * - paid is terminal
 * - if status='pending' and due_date < today → overdue
 */
export function computeEffectiveStatus(
  status: string,
  dueDateStr: string,
  today: string
): "pending" | "paid" | "overdue" | "cancelled" {
  if (status === "cancelled" || status === "paid") return status as any;
  const due = new Date(dueDateStr);
  const t = new Date(today);
  if (due < t) return "overdue";
  return "pending";
}

/**
 * Calculate next due date for recurring account.
 * Only advances if current due_date is in the past.
 */
export function getNextDueDate(
  account: AccountPayable,
  today: string
): string {
  if (account.type !== "recurring" || !account.frequency) {
    return typeof account.due_date === "string" ? account.due_date : account.due_date.toISOString().slice(0, 10);
  }
  const t = new Date(today);
  // due_date may be string or Date object
  let next = typeof account.due_date === "string" ? account.due_date : account.due_date.toISOString().slice(0, 10);
  const monthsToAdd = account.frequency === "monthly" ? 1
    : account.frequency === "quarterly" ? 3
    : 12;
  // addMonths expects string and returns string
  while (new Date(next) < t) {
    next = addMonths(next, monthsToAdd);
  }
  return next;
}

/**
 * Refresh all statuses: pending → overdue if date passed.
 * Returns count of changes.
 */
export async function refreshAccountsPayable(pool: Pool, householdId: string): Promise<{
  updated: number;
  cancelled: any[];
  created: any[];
}> {
  const result = await pool.query<{ rows: any[] }>(
    `UPDATE accounts_payable
     SET status = 'overdue', updated_at = NOW()
     WHERE household_id = $1
       AND status = 'pending'
       AND due_date < CURRENT_DATE
       AND deleted_at IS NULL
     RETURNING id, description, amount_cents, due_date::text`,
    [householdId]
  );

  // Auto-advance recurring accounts: create next occurrence
  const recResult = await pool.query<{ rows: any[] }>(
    `SELECT * FROM accounts_payable
     WHERE household_id = $1
       AND type = 'recurring'
       AND status = 'paid'
       AND deleted_at IS NULL
       AND (end_date IS NULL OR end_date > CURRENT_DATE)`,
    [householdId]
  );

  const created: any[] = [];
  for (const ap of recResult.rows) {
    const next = getNextDueDate(ap, new Date().toISOString().slice(0, 10));
    // Check if next already exists (avoid dupes)
    const exists = await pool.query(
      `SELECT id FROM accounts_payable
       WHERE description = $1
         AND due_date = $2::date
         AND household_id = $3
         AND deleted_at IS NULL`,
      [ap.description, next, householdId]
    );
    if (exists.rows.length === 0 && next > ap.due_date) {
      const insert = await pool.query<{ rows: any[] }>(
        `INSERT INTO accounts_payable
         (household_id, account_id, category_id, description, amount_cents,
          type, frequency, due_date, end_date, reminder_days_before, source_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11)
         RETURNING id, due_date::text, amount_cents`,
        [
          ap.household_id, ap.account_id, ap.category_id, ap.description,
          ap.amount_cents, ap.type, ap.frequency, next, ap.end_date,
          ap.reminder_days_before, ap.source_message_id,
        ]
      );
      created.push(insert.rows[0]);
    }
  }

  return {
    updated: result.rows.length,
    cancelled: [],
    created,
  };
}

/**
 * Get accounts that need a reminder.
 * Logic: pending or overdue, due_date - reminder_days_before <= today, last_reminder is null or before today
 */
export async function getAccountsNeedingReminder(
  pool: Pool, householdId: string
): Promise<AccountPayableWithDetails[]> {
  const result = await pool.query<{ rows: any[] }>(
    `SELECT ap.*, a.name as account_name, c.name as category_name
     FROM accounts_payable ap
     LEFT JOIN accounts a ON a.id = ap.account_id
     LEFT JOIN categories c ON c.id = ap.category_id
     WHERE ap.household_id = $1
       AND ap.status IN ('pending', 'overdue')
       AND ap.deleted_at IS NULL
       AND ap.due_date <= (CURRENT_DATE + ap.reminder_days_before * INTERVAL '1 day')
       AND (ap.last_reminder_sent_at IS NULL
            OR ap.last_reminder_sent_at::date < CURRENT_DATE)
     ORDER BY ap.due_date ASC`,
    [householdId]
  );

  const today = new Date().toISOString().slice(0, 10);
  return result.rows.map((r) => {
    const daysUntil = Math.floor(
      (new Date(r.due_date).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      ...r,
      days_until_due: daysUntil,
      effective_status: computeEffectiveStatus(r.status, r.due_date, today),
      needs_reminder: true,
    };
  });
}

/**
 * Mark reminder as sent.
 */
export async function markReminderSent(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `UPDATE accounts_payable
     SET last_reminder_sent_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id]
  );
}

const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;

/**
 * Format reminder message for user.
 */
export function formatReminder(item: AccountPayableWithDetails): string {
  if (item.days_until_due < 0) {
    return `🚨 VENCIDA há ${Math.abs(item.days_until_due)} dia(s): ${item.description} (${fmt(parseInt(item.amount_cents, 10))}) — conta ${item.account_name}`;
  } else if (item.days_until_due === 0) {
    return `🔥 VENCE HOJE: ${item.description} (${fmt(parseInt(item.amount_cents, 10))}) — conta ${item.account_name}`;
  } else if (item.days_until_due === 1) {
    return `⏰ Vence amanhã: ${item.description} (${fmt(parseInt(item.amount_cents, 10))}) — conta ${item.account_name}`;
  } else if (item.days_until_due <= 7) {
    return `📅 Vence em ${item.days_until_due} dia(s): ${item.description} (${fmt(parseInt(item.amount_cents, 10))}) — conta ${item.account_name}`;
  } else {
    return `📌 Vence em ${item.days_until_due} dia(s): ${item.description} (${fmt(parseInt(item.amount_cents, 10))}) — conta ${item.account_name}`;
  }
}

/**
 * Format summary of accounts by status.
 */
export function formatAccountsList(accounts: AccountPayableWithDetails[]): string {
  if (accounts.length === 0) return "Nenhuma conta encontrada";

  const groups: Record<string, AccountPayableWithDetails[]> = {
    overdue: [],
    pending: [],
    paid: [],
    cancelled: [],
  };

  const today = new Date().toISOString().slice(0, 10);
  for (const ap of accounts) {
    const status = ap.effective_status || computeEffectiveStatus(ap.status, ap.due_date, today);
    groups[status].push(ap);
  }

  const lines: string[] = [];
  const totalCents = (xs: AccountPayableWithDetails[]) => xs.reduce((s, x) => s + parseInt(x.amount_cents, 10), 0);

  if (groups.overdue.length > 0) {
    lines.push(`🚨 Vencidas (${groups.overdue.length}) — total: ${fmt(totalCents(groups.overdue))}`);
    for (const ap of groups.overdue) {
      lines.push(`   • ${ap.description} (${fmt(parseInt(ap.amount_cents, 10))}) — venceu ${Math.abs(ap.days_until_due)}d atrás, ${ap.due_date}`);
    }
  }
  if (groups.pending.length > 0) {
    lines.push(`📅 Pendentes (${groups.pending.length}) — total: ${fmt(totalCents(groups.pending))}`);
    for (const ap of groups.pending.slice(0, 8)) {
      lines.push(`   • ${ap.description} (${fmt(parseInt(ap.amount_cents, 10))}) — vence em ${ap.days_until_due}d, ${ap.due_date}`);
    }
    if (groups.pending.length > 8) {
      lines.push(`   ... e mais ${groups.pending.length - 8}`);
    }
  }
  if (groups.paid.length > 0) {
    lines.push(`✅ Pagas (${groups.paid.length}) — total: ${fmt(totalCents(groups.paid))}`);
  }
  if (groups.cancelled.length > 0) {
    lines.push(`❌ Canceladas (${groups.cancelled.length})`);
  }

  return lines.join("\n");
}
