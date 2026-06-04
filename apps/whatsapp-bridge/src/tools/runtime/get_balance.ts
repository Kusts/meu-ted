/**
 * get_balance — Runtime implementation
 * Read-only tool: calculates balance from transactions, no side effects.
 *
 * Balance formula (from spec):
 * balance = initial_balance_cents
 *   + SUM(amount_cents) WHERE kind='income' AND to_account_id=X AND deleted_at IS NULL
 *   - SUM(amount_cents) WHERE kind='expense' AND from_account_id=X AND deleted_at IS NULL
 *   - SUM(amount_cents) WHERE kind='transfer' AND from_account_id=X AND deleted_at IS NULL
 *   + SUM(amount_cents) WHERE kind='transfer' AND to_account_id=X AND deleted_at IS NULL
 */

import { query } from '../db.js';
import type { GetBalanceResult } from '../types.js';
import { validateUUID } from '../errors.js';

interface AccountInfo {
  id: string;
  name: string;
  initial_balance_cents: string;
}

interface BalanceAggregate {
  income_sum: string | null;
  expense_sum: string | null;
  transfer_out: string | null;
  transfer_in: string | null;
}

export async function getBalance(
  accountId: string,
  householdId: string
): Promise<GetBalanceResult> {
  try {
    // Validate inputs (structural only — no financial logic)
    validateUUID(accountId, 'account_id');
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Validation error',
      account_id: accountId,
      account_name: '',
      initial_balance_cents: 0,
      calculated_balance_cents: 0,
    };
  }

  try {
    // Get account info
    const accountResult = await query<AccountInfo>(
      `SELECT id, name, initial_balance_cents
       FROM accounts
       WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL`,
      [accountId, householdId]
    );

    if (accountResult.rows.length === 0) {
      return {
        success: false,
        error: 'Account not found',
        account_id: accountId,
        account_name: '',
        initial_balance_cents: 0,
        calculated_balance_cents: 0,
      };
    }

    const account = accountResult.rows[0];
    const initialBalance = parseInt(account.initial_balance_cents, 10);

    // Calculate from transactions
    const balanceResult = await query<BalanceAggregate>(
      `SELECT
        COALESCE(SUM(CASE WHEN kind = 'income' AND to_account_id = $1 THEN amount_cents ELSE 0 END), 0) as income_sum,
        COALESCE(SUM(CASE WHEN kind = 'expense' AND from_account_id = $1 THEN amount_cents ELSE 0 END), 0) as expense_sum,
        COALESCE(SUM(CASE WHEN kind = 'transfer' AND from_account_id = $1 THEN amount_cents ELSE 0 END), 0) as transfer_out,
        COALESCE(SUM(CASE WHEN kind = 'transfer' AND to_account_id = $1 THEN amount_cents ELSE 0 END), 0) as transfer_in
       FROM transactions
       WHERE household_id = $2 AND deleted_at IS NULL
         AND (from_account_id = $1 OR to_account_id = $1)`,
      [accountId, householdId]
    );

    const agg = balanceResult.rows[0];
    const income = parseInt(String(agg.income_sum), 10);
    const expense = parseInt(String(agg.expense_sum), 10);
    const transferOut = parseInt(String(agg.transfer_out), 10);
    const transferIn = parseInt(String(agg.transfer_in), 10);

    const calculatedBalance = initialBalance + income - expense - transferOut + transferIn;

    return {
      success: true,
      account_id: accountId,
      account_name: account.name,
      initial_balance_cents: initialBalance,
      calculated_balance_cents: calculatedBalance,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      success: false,
      error: message,
      account_id: accountId,
      account_name: '',
      initial_balance_cents: 0,
      calculated_balance_cents: 0,
    };
  }
}