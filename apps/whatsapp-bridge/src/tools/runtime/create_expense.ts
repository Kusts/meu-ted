/**
 * create_expense — Runtime implementation
 * Write tool: inserts expense transaction.
 *
 * amount_cents always positive — sign encoded in kind='expense'.
 * Idempotency: if idempotency_key exists for household, returns existing.
 */

import { query } from '../db.js';
import type { CreateExpenseResult } from '../types.js';
import { validateUUID, validatePositiveCents, validateDateString, validateNonEmpty } from '../errors.js';
import { randomUUID } from 'crypto';

export async function createExpense(
  description: string,
  amountCents: number,
  categoryId: string,
  accountId: string,
  date: string,
  householdId: string,
  sourceMessageId?: string,
  idempotencyKey?: string
): Promise<CreateExpenseResult> {
  // Validate inputs
  try {
    validateNonEmpty(description, 'description');
    validatePositiveCents(amountCents, 'amount_cents');
    validateUUID(categoryId, 'category_id');
    validateUUID(accountId, 'account_id');
    validateUUID(householdId, 'household_id');
    validateDateString(date, 'date');
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Validation error',
    };
  }

  try {
    // Idempotency check
    if (idempotencyKey) {
      const existing = await query(
        `SELECT id FROM transactions WHERE household_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL LIMIT 1`,
        [householdId, idempotencyKey]
      );
      if (existing.rows.length > 0) {
        return { success: true, transaction_id: existing.rows[0].id };
      }
    }

    // Verify category exists and belongs to household
    const categoryCheck = await query(
      `SELECT id FROM categories WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [categoryId, householdId]
    );
    if (categoryCheck.rows.length === 0) {
      return { success: false, error: 'Category not found or inactive' };
    }

    // Verify account exists and belongs to household
    const accountCheck = await query(
      `SELECT id FROM accounts WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [accountId, householdId]
    );
    if (accountCheck.rows.length === 0) {
      return { success: false, error: 'Account not found or inactive' };
    }

    const id = randomUUID();

    const result = await query(
      `INSERT INTO transactions (id, household_id, kind, amount_cents, description, category_id, from_account_id, date, status, source_message_id, idempotency_key, created_at)
       VALUES ($1, $2, 'expense', $3, $4, $5, $6, $7, 'confirmed', $8, $9, NOW())
       RETURNING id`,
      [id, householdId, amountCents, description.trim(), categoryId, accountId, date, sourceMessageId ?? null, idempotencyKey ?? null]
    );

    return { success: true, transaction_id: result.rows[0].id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}