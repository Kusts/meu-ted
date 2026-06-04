/**
 * list_accounts — Runtime implementation
 * Read-only tool: queries accounts table, no side effects.
 * Balance is calculated in get_balance — not stored here.
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