/**
 * update_transaction — Runtime implementation
 * Update description, amount_cents, date, category_id, account for a transaction.
 * Cannot change kind, amount sign, or the transaction ID.
 */

import { query } from '../db.js';
import type { UpdateTransactionResult } from '../types.js';
import { validateUUID, validatePositiveCents, validateDateString, validateNonEmpty } from '../errors.js';

export async function updateTransaction(
  transactionId: string,
  updates: {
    description?: string;
    amount_cents?: number;
    date?: string;
    category_id?: string;
    from_account_id?: string;
  },
  householdId: string
): Promise<UpdateTransactionResult> {
  try {
    validateUUID(transactionId, 'transaction_id');
    validateUUID(householdId, 'household_id');

    if (updates.description !== undefined) {
      validateNonEmpty(updates.description, 'description');
    }
    if (updates.amount_cents !== undefined) {
      validatePositiveCents(updates.amount_cents, 'amount_cents');
    }
    if (updates.date !== undefined) {
      validateDateString(updates.date, 'date');
    }
    if (updates.category_id !== undefined) {
      validateUUID(updates.category_id, 'category_id');
    }
    if (updates.from_account_id !== undefined) {
      validateUUID(updates.from_account_id, 'from_account_id');
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation error' };
  }

  try {
    const existing = await query(
      `SELECT id, kind FROM transactions WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [transactionId, householdId]
    );

    if (existing.rows.length === 0) {
      return { success: false, error: 'Transaction not found or already deleted' };
    }

    if (updates.category_id) {
      const catCheck = await query(
        `SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [updates.category_id, householdId]
      );
      if (catCheck.rows.length === 0) {
        return { success: false, error: 'Category not found or inactive' };
      }
    }

    if (updates.from_account_id) {
      const accCheck = await query(
        `SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
        [updates.from_account_id, householdId]
      );
      if (accCheck.rows.length === 0) {
        return { success: false, error: 'Account not found or inactive' };
      }
    }

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIdx++}`);
      params.push(updates.description.trim());
    }
    if (updates.amount_cents !== undefined) {
      setClauses.push(`amount_cents = $${paramIdx++}`);
      params.push(updates.amount_cents);
    }
    if (updates.date !== undefined) {
      setClauses.push(`date = $${paramIdx++}`);
      params.push(updates.date);
    }
    if (updates.category_id !== undefined) {
      setClauses.push(`category_id = $${paramIdx++}`);
      params.push(updates.category_id);
    }
    if (updates.from_account_id !== undefined) {
      setClauses.push(`from_account_id = $${paramIdx++}`);
      params.push(updates.from_account_id);
    }

    params.push(transactionId, householdId);

    const result = await query(
      `UPDATE transactions SET ${setClauses.join(', ')} WHERE id = $${paramIdx++} AND household_id = $${paramIdx} AND deleted_at IS NULL RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'Transaction not found or already deleted' };
    }

    return { success: true, transaction_id: result.rows[0].id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}