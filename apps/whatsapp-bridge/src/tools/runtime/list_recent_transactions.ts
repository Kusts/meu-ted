/**
 * list_recent_transactions — Runtime implementation
 * Read-only tool: queries transactions with ordering, no side effects.
 *
 * ARCHITECTURAL NOTE:
 * Standalone async function (NOT a Pi ToolDefinition).
 * See .pi/extensions/financial-tools/tools/list_recent_transactions.ts for Pi version.
 * SQL is identical — this version exists for scripts/reminder.ts (outside Pi context).
 */

import { query } from '../db.js';
import type { ListRecentTransactionsResult, TransactionRow } from '../types.js';
import { validateUUID } from '../errors.js';

interface TransactionRowDb {
  id: string;
  kind: string;
  amount_cents: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  from_account_id: string | null;
  from_account_name: string | null;
  to_account_id: string | null;
  to_account_name: string | null;
  date: Date;
  status: string;
  source_message_id: string | null;
  created_at: Date;
}

export async function listRecentTransactions(
  householdId: string,
  limit: number = 10,
  accountId?: string
): Promise<ListRecentTransactionsResult> {
  validateUUID(householdId, 'household_id');

  // Validate limit
  if (limit < 1 || limit > 100) {
    return {
      success: false,
      error: 'Limit must be between 1 and 100',
      transactions: [],
      count: 0,
    };
  }

  try {
    let sql = `
      SELECT
        t.id, t.kind, t.amount_cents, t.description,
        t.category_id, c.name as category_name,
        t.from_account_id, fa.name as from_account_name,
        t.to_account_id, ta.name as to_account_name,
        t.date, t.status, t.source_message_id, t.created_at
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN accounts fa ON t.from_account_id = fa.id
      LEFT JOIN accounts ta ON t.to_account_id = ta.id
      WHERE t.household_id = $1 AND t.deleted_at IS NULL
    `;

    const params: unknown[] = [householdId];

    if (accountId) {
      validateUUID(accountId, 'account_id');
      sql += ` AND (t.from_account_id = $2 OR t.to_account_id = $2)`;
      params.push(accountId);
    }

    sql += ` ORDER BY t.date DESC, t.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query<TransactionRowDb>(sql, params);

    const transactions: TransactionRow[] = result.rows.map((row: TransactionRowDb) => ({
      id: row.id,
      kind: row.kind as 'expense' | 'income' | 'transfer',
      amount_cents: parseInt(row.amount_cents, 10),
      description: row.description ?? null,
      category_id: row.category_id ?? null,
      category_name: row.category_name ?? null,
      from_account_id: row.from_account_id ?? null,
      from_account_name: row.from_account_name ?? null,
      to_account_id: row.to_account_id ?? null,
      to_account_name: row.to_account_name ?? null,
      date: row.date.toISOString().split('T')[0],
      status: row.status as 'confirmed' | 'pending',
      source_message_id: row.source_message_id ?? null,
      created_at: row.created_at.toISOString(),
    }));

    return {
      success: true,
      transactions,
      count: transactions.length,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message, transactions: [], count: 0 };
  }
}