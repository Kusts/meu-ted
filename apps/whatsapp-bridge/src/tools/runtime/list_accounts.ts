/**
 * list_accounts — Runtime implementation
 * Read-only tool: queries accounts table, no side effects.
 *
 * ARCHITECTURAL NOTE:
 * These runtime tools are standalone async functions (NOT Pi ToolDefinitions).
 * They use a singleton Pool from '../db.js' and can be imported from any Node context.
 * They exist because the Pi extension tools (in .pi/extensions/financial-tools/tools/)
 * are ToolDefinition objects that only work within the Pi agent's execution context.
 *
 * The reminder script (scripts/reminder.ts) uses these directly via RealDataProvider.
 *
 * SQL is identical to the extension's list_accounts tool — see .pi/extensions/financial-tools/tools/list_accounts.ts
 * for the canonical Pi tool. This runtime version is kept for standalone script execution.
 */

import { query } from '../db.js';
import type { ListAccountsResult, AccountRow } from '../types.js';

interface AccountRowDb {
  id: string;
  name: string;
  initial_balance_cents: string; // BIGINT from DB
  active: boolean;
  created_at: Date;
}

export async function listAccounts(householdId: string): Promise<ListAccountsResult> {
  try {
    const result = await query<AccountRowDb>(
      `SELECT id, name, initial_balance_cents, active, created_at
       FROM accounts
       WHERE household_id = $1 AND active = true AND deleted_at IS NULL
       ORDER BY name ASC`,
      [householdId]
    );

    const accounts: AccountRow[] = result.rows.map((row: AccountRowDb) => ({
      id: row.id,
      name: row.name,
      initial_balance_cents: parseInt(row.initial_balance_cents, 10),
      active: row.active,
      created_at: row.created_at.toISOString(),
    }));

    return { success: true, accounts };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message, accounts: [] };
  }
}