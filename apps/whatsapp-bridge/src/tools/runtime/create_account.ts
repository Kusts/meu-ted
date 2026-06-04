/**
 * create_account — Runtime implementation
 * Write tool: inserts new account, no balance impact from Node logic.
 */

import { query } from '../db.js';
import type { CreateAccountResult } from '../types.js';
import { validateUUID, validateNonEmpty, validateCents } from '../errors.js';
import { randomUUID } from 'crypto';

export async function createAccount(
  name: string,
  initialBalanceCents: number,
  householdId: string
): Promise<CreateAccountResult> {
  // Validate inputs
  try {
    validateNonEmpty(name, 'name');
    validateCents(initialBalanceCents, 'initial_balance_cents');
    validateUUID(householdId, 'household_id');
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Validation error',
    };
  }

  try {
    // Check duplicate name for household
    const existing = await query(
      `SELECT id FROM accounts WHERE household_id = $1 AND LOWER(name) = LOWER($2) AND deleted_at IS NULL LIMIT 1`,
      [householdId, name.trim()]
    );

    if (existing.rows.length > 0) {
      return {
        success: false,
        error: `Account with name="${name.trim()}" already exists in this household`,
      };
    }

    const id = randomUUID();

    const result = await query(
      `INSERT INTO accounts (id, household_id, name, initial_balance_cents, active, created_at)
       VALUES ($1, $2, $3, $4, true, NOW())
       RETURNING id`,
      [id, householdId, name.trim(), initialBalanceCents]
    );

    return {
      success: true,
      account_id: result.rows[0].id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('duplicate') || message.includes('unique')) {
      return { success: false, error: `Account with name="${name.trim()}" already exists` };
    }
    return { success: false, error: message };
  }
}