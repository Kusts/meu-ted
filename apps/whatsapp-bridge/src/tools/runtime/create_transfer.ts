/**
 * create_transfer — Runtime implementation
 * Write tool: inserts transfer transaction (links two accounts).
 *
 * amount_cents always positive — sign encoded in kind='transfer'.
 * Idempotency: if idempotency_key exists for household, returns existing.
 */

import { query } from '../db.js';
import type { CreateTransferResult } from '../types.js';
import { validateUUID, validatePositiveCents, validateDateString, validateNonEmpty } from '../errors.js';
import { randomUUID } from 'crypto';

export async function createTransfer(
  fromAccountId: string,
  toAccountId: string,
  amountCents: number,
  description: string,
  date: string,
  householdId: string,
  sourceMessageId?: string,
  idempotencyKey?: string
): Promise<CreateTransferResult> {
  // Validate inputs
  try {
    if (fromAccountId === toAccountId) {
      return { success: false, error: 'from_account_id and to_account_id must be different' };
    }
    validateUUID(fromAccountId, 'from_account_id');
    validateUUID(toAccountId, 'to_account_id');
    validatePositiveCents(amountCents, 'amount_cents');
    validateUUID(householdId, 'household_id');
    validateDateString(date, 'date');
    validateNonEmpty(description, 'description');
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

    // Verify both accounts exist and belong to household
    const accountsCheck = await query(
      `SELECT id FROM accounts WHERE household_id = $1 AND id IN ($2, $3) AND deleted_at IS NULL`,
      [householdId, fromAccountId, toAccountId]
    );
    if (accountsCheck.rows.length !== 2) {
      return { success: false, error: 'One or both accounts not found or inactive' };
    }

    const id = randomUUID();

    const result = await query(
      `INSERT INTO transactions (id, household_id, kind, amount_cents, description, from_account_id, to_account_id, date, status, source_message_id, idempotency_key, created_at)
       VALUES ($1, $2, 'transfer', $3, $4, $5, $6, $7, 'confirmed', $8, $9, NOW())
       RETURNING id`,
      [id, householdId, amountCents, description.trim(), fromAccountId, toAccountId, date, sourceMessageId ?? null, idempotencyKey ?? null]
    );

    return { success: true, transaction_id: result.rows[0].id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}