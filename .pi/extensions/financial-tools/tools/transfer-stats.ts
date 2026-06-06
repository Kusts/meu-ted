/**
 * transfer-stats — Aggregates transfer statistics by recipient
 *
 * Provides insights like:
 * - "Você fez 3 PIX para João Silva este mês (R$ 450 total)"
 * - "Total enviado para João Silva: R$ 1.200 (últimos 3 meses)"
 * - "PIX por destinatário (top 5)"
 */

import type { Pool } from "pg";

export interface RecipientStats {
  recipientName: string;
  totalSentCents: number;
  totalReceivedCents: number;
  sentCount: number;
  receivedCount: number;
  lastSentAt: Date | null;
  lastReceivedAt: Date | null;
  methodCounts: Record<string, number>;
}

export interface PeriodStats {
  startDate: string;
  endDate: string;
  totalSentCents: number;
  totalReceivedCents: number;
  sentCount: number;
  receivedCount: number;
  byRecipient: RecipientStats[];
}

/**
 * Get transfer statistics for a household within a date range.
 */
export async function getTransferStats(
  pool: Pool,
  householdId: string,
  startDate: string,
  endDate: string
): Promise<PeriodStats> {
  // Get all transfers (outgoing and incoming) for the household
  const result = await pool.query(
    `SELECT
       id, kind, amount_cents, method, recipient_name, description, date
     FROM transactions
     WHERE household_id = $1
       AND kind = 'transfer'
       AND date BETWEEN $2 AND $3
       AND deleted_at IS NULL
     ORDER BY date DESC`,
    [householdId, startDate, endDate]
  );

  // Get all expenses with recipient (outgoing_third categorized as expense)
  const expenseResult = await pool.query(
    `SELECT
       t.id, t.amount_cents, t.description, t.date, c.name as category_name,
       t.recipient_name, t.method
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.household_id = $1
       AND t.kind = 'expense'
       AND c.name LIKE 'Transferência >%'
       AND t.date BETWEEN $2 AND $3
       AND t.deleted_at IS NULL
     ORDER BY t.date DESC`,
    [householdId, startDate, endDate]
  );

  // Get all incomes with recipient (incoming_third)
  const incomeResult = await pool.query(
    `SELECT
       t.id, t.amount_cents, t.description, t.date, c.name as category_name,
       t.recipient_name, t.method
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.household_id = $1
       AND t.kind = 'income'
       AND c.name LIKE 'Transferência >%Recebido'
       AND t.date BETWEEN $2 AND $3
       AND t.deleted_at IS NULL
     ORDER BY t.date DESC`,
    [householdId, startDate, endDate]
  );

  // Aggregate by recipient
  const byRecipient = new Map<string, RecipientStats>();

  const addSent = (recipient: string | null, amountCents: number, method: string | null, date: Date) => {
    if (!recipient) return;
    if (!byRecipient.has(recipient)) {
      byRecipient.set(recipient, {
        recipientName: recipient,
        totalSentCents: 0,
        totalReceivedCents: 0,
        sentCount: 0,
        receivedCount: 0,
        lastSentAt: null,
        lastReceivedAt: null,
        methodCounts: {},
      });
    }
    const stats = byRecipient.get(recipient)!;
    stats.totalSentCents += amountCents;
    stats.sentCount += 1;
    if (!stats.lastSentAt || date > stats.lastSentAt) {
      stats.lastSentAt = date;
    }
    const m = method || "OTHER";
    stats.methodCounts[m] = (stats.methodCounts[m] || 0) + 1;
  };

  const addReceived = (recipient: string | null, amountCents: number, method: string | null, date: Date) => {
    if (!recipient) return;
    if (!byRecipient.has(recipient)) {
      byRecipient.set(recipient, {
        recipientName: recipient,
        totalSentCents: 0,
        totalReceivedCents: 0,
        sentCount: 0,
        receivedCount: 0,
        lastSentAt: null,
        lastReceivedAt: null,
        methodCounts: {},
      });
    }
    const stats = byRecipient.get(recipient)!;
    stats.totalReceivedCents += amountCents;
    stats.receivedCount += 1;
    if (!stats.lastReceivedAt || date > stats.lastReceivedAt) {
      stats.lastReceivedAt = date;
    }
    const m = method || "OTHER";
    stats.methodCounts[m] = (stats.methodCounts[m] || 0) + 1;
  };

  // From transfers (kind=transfer, between own accounts - not third party)
  // Skip these for recipient stats since they're internal

  // From expenses with category "Transferência > X"
  for (const row of expenseResult.rows) {
    const recipient = row.recipient_name || extractRecipientFromDescription(row.description, row.category_name);
    addSent(recipient, parseInt(row.amount_cents, 10), row.method, new Date(row.date));
  }

  // From incomes with category "Transferência > X Recebido"
  for (const row of incomeResult.rows) {
    const recipient = row.recipient_name || extractRecipientFromDescription(row.description, row.category_name);
    addReceived(recipient, parseInt(row.amount_cents, 10), row.method, new Date(row.date));
  }

  const sorted = Array.from(byRecipient.values()).sort(
    (a, b) => b.totalSentCents + b.totalReceivedCents - (a.totalSentCents + a.totalReceivedCents)
  );

  return {
    startDate,
    endDate,
    totalSentCents: expenseResult.rows.reduce((sum, r) => sum + parseInt(r.amount_cents, 10), 0),
    totalReceivedCents: incomeResult.rows.reduce((sum, r) => sum + parseInt(r.amount_cents, 10), 0),
    sentCount: expenseResult.rows.length,
    receivedCount: incomeResult.rows.length,
    byRecipient: sorted,
  };
}

/**
 * Format stats as a human-readable summary.
 */
export function formatTransferStats(stats: PeriodStats, periodLabel: string = "no período"): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [];

  lines.push(`📊 Transferências ${periodLabel} (${stats.startDate} → ${stats.endDate})`);
  lines.push("");
  lines.push(`💸 Enviado: ${stats.sentCount} transferências, total ${fmt(stats.totalSentCents)}`);
  lines.push(`💰 Recebido: ${stats.receivedCount} transferências, total ${fmt(stats.totalReceivedCents)}`);

  if (stats.byRecipient.length > 0) {
    lines.push("");
    lines.push(`👥 Por destinatário (top ${Math.min(5, stats.byRecipient.length)}):`);
    const top = stats.byRecipient.slice(0, 5);
    for (const r of top) {
      const parts: string[] = [];
      if (r.sentCount > 0) parts.push(`enviou ${r.sentCount}× (${fmt(r.totalSentCents)})`);
      if (r.receivedCount > 0) parts.push(`recebeu ${r.receivedCount}× (${fmt(r.totalReceivedCents)})`);
      const methods = Object.entries(r.methodCounts).map(([m, c]) => `${m}×${c}`).join(", ");
      lines.push(`  • ${r.recipientName}: ${parts.join(" | ")} [${methods}]`);
    }
  }

  return lines.join("\n");
}

/**
 * Get stats for a specific recipient.
 */
export async function getRecipientStats(
  pool: Pool,
  householdId: string,
  recipientName: string,
  startDate?: string,
  endDate?: string
): Promise<RecipientStats | null> {
  const start = startDate || "1900-01-01";
  const end = endDate || "2100-12-31";

  // Search expenses
  const expenseResult = await pool.query(
    `SELECT
       t.amount_cents, t.date, t.method
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.household_id = $1
       AND t.kind = 'expense'
       AND c.name LIKE 'Transferência >%'
       AND LOWER(UNACCENT(COALESCE(t.recipient_name, ''))) = LOWER(UNACCENT($2))
       AND t.date BETWEEN $3 AND $4
       AND t.deleted_at IS NULL
     ORDER BY t.date DESC`,
    [householdId, recipientName, start, end]
  );

  // Search incomes
  const incomeResult = await pool.query(
    `SELECT
       t.amount_cents, t.date, t.method
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.household_id = $1
       AND t.kind = 'income'
       AND c.name LIKE 'Transferência >%Recebido'
       AND LOWER(UNACCENT(COALESCE(t.recipient_name, ''))) = LOWER(UNACCENT($2))
       AND t.date BETWEEN $3 AND $4
       AND t.deleted_at IS NULL
     ORDER BY t.date DESC`,
    [householdId, recipientName, start, end]
  );

  if (expenseResult.rows.length === 0 && incomeResult.rows.length === 0) {
    return null;
  }

  const stats: RecipientStats = {
    recipientName,
    totalSentCents: 0,
    totalReceivedCents: 0,
    sentCount: 0,
    receivedCount: 0,
    lastSentAt: null,
    lastReceivedAt: null,
    methodCounts: {},
  };

  for (const row of expenseResult.rows) {
    const cents = parseInt(row.amount_cents, 10);
    stats.totalSentCents += cents;
    stats.sentCount += 1;
    if (!stats.lastSentAt || new Date(row.date) > stats.lastSentAt) {
      stats.lastSentAt = new Date(row.date);
    }
    const m = row.method || "OTHER";
    stats.methodCounts[m] = (stats.methodCounts[m] || 0) + 1;
  }

  for (const row of incomeResult.rows) {
    const cents = parseInt(row.amount_cents, 10);
    stats.totalReceivedCents += cents;
    stats.receivedCount += 1;
    if (!stats.lastReceivedAt || new Date(row.date) > stats.lastReceivedAt) {
      stats.lastReceivedAt = new Date(row.date);
    }
    const m = row.method || "OTHER";
    stats.methodCounts[m] = (stats.methodCounts[m] || 0) + 1;
  }

  return stats;
}

/**
 * Format recipient stats as a summary.
 */
export function formatRecipientStats(stats: RecipientStats, periodLabel: string = "no período"): string {
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`;
  const lines: string[] = [];

  lines.push(`👤 ${stats.recipientName} ${periodLabel}`);
  if (stats.sentCount > 0) {
    lines.push(`💸 Enviado: ${stats.sentCount}× (${fmt(stats.totalSentCents)})`);
    if (stats.lastSentAt) {
      lines.push(`   Última vez: ${stats.lastSentAt.toISOString().slice(0, 10)}`);
    }
  }
  if (stats.receivedCount > 0) {
    lines.push(`💰 Recebido: ${stats.receivedCount}× (${fmt(stats.totalReceivedCents)})`);
    if (stats.lastReceivedAt) {
      lines.push(`   Última vez: ${stats.lastReceivedAt.toISOString().slice(0, 10)}`);
    }
  }
  const methods = Object.entries(stats.methodCounts).map(([m, c]) => `${m}×${c}`).join(", ");
  if (methods) {
    lines.push(`📊 Métodos: ${methods}`);
  }
  return lines.join("\n");
}

/**
 * Helper: try to extract a recipient from description when recipient_name is null.
 * Looks for patterns like "PIX/TED/DOC/Transfer [Name] - motivo".
 */
function extractRecipientFromDescription(description: string | null, categoryName: string | null): string | null {
  if (!description) return null;
  // Same as the classifier's logic
  const m = description.match(/^(?:PIX|TED|DOC|TRANSFER(?:ÊNCIA|ENCIA)?|DINHEIRO|CAIXA)\s+([A-Za-zÀ-ú][^-]+?)(?:\s*[-–—]\s*.*)?$/i);
  if (m && m[1]) {
    let name = m[1].trim();
    name = name.replace(/^(para|pra|à|a)\s+/i, "");
    const STOPWORDS = [
      "aluguel", "conta", "compra", "pagamento", "salário", "salario",
      "nubank", "itau", "itaú", "carteira", "bradesco", "santander", "caixa", "banco",
    ];
    if ([...name].length >= 2 && !STOPWORDS.includes(name.toLowerCase())) {
      return name;
    }
  }
  return null;
}
