// ─────────────────────────────────────────────────────────────────────────────
// Legacy exports for backward compatibility
// These are the original domain functions from before refactoring
// ─────────────────────────────────────────────────────────────────────────────

import type { IdempotencyKey as IdempotencyKeyType } from './core/entities/idempotency-key.js';

/**
 * Calculate account balance from ledger entries
 * balance = initial_balance + sum(credits) - sum(debits)
 * REQ-010: allows negative balance
 */
export function calculateAccountBalance(
  initialBalanceCents: number,
  ledgerEntries: { direction: 'credit' | 'debit'; amountCents: number }[]
): number {
  const credits = ledgerEntries
    .filter(e => e.direction === 'credit')
    .reduce((sum, e) => sum + e.amountCents, 0);
  const debits = ledgerEntries
    .filter(e => e.direction === 'debit')
    .reduce((sum, e) => sum + e.amountCents, 0);
  return initialBalanceCents + credits - debits;
}

// Transfer ledger entries type
export interface TransferLedgerEntries {
  fromEntry: {
    householdId: string;
    recordId: string;
    accountId: string;
    direction: 'debit';
    amountCents: number;
    effectiveDate: string;
    entryType: 'cash' | 'card_charge' | 'invoice_payment' | 'transfer' | 'interest' | 'adjustment';
    cardId?: null;
    invoiceId?: null;
  };
  toEntry: {
    householdId: string;
    recordId: string;
    accountId: string;
    direction: 'credit';
    amountCents: number;
    effectiveDate: string;
    entryType: 'cash' | 'card_charge' | 'invoice_payment' | 'transfer' | 'interest' | 'adjustment';
    cardId?: null;
    invoiceId?: null;
  };
}

/**
 * Create debit + credit ledger entries for a transfer
 * REQ-034: transfer creates debit from source + credit to destination
 */
export function createTransferLedgerEntries(params: {
  householdId: string;
  recordId: string;
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  effectiveDate: string;
  entryType?: 'cash' | 'card_charge' | 'invoice_payment' | 'transfer' | 'interest' | 'adjustment';
}): TransferLedgerEntries {
  const entryType = params.entryType ?? 'transfer';
  
  return {
    fromEntry: {
      householdId: params.householdId,
      recordId: params.recordId,
      accountId: params.fromAccountId,
      direction: 'debit',
      amountCents: params.amountCents,
      effectiveDate: params.effectiveDate,
      entryType,
      cardId: undefined,
      invoiceId: undefined,
    },
    toEntry: {
      householdId: params.householdId,
      recordId: params.recordId,
      accountId: params.toAccountId,
      direction: 'credit',
      amountCents: params.amountCents,
      effectiveDate: params.effectiveDate,
      entryType,
      cardId: undefined,
      invoiceId: undefined,
    },
  };
}

// Idempotency check result
export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingKey?: IdempotencyKeyType;
  reason?: string;
}

// Legacy IdempotencyKey type alias
export type IdempotencyKey = IdempotencyKeyType;

/**
 * Check if an idempotency key already exists and is valid
 * REQ-032: ignore already-processed source_message_id values
 */
export function checkIdempotencyKey(
  existingKey: IdempotencyKey | null,
  newKeyExpiresAt: Date | null
): DuplicateCheckResult {
  if (!existingKey) {
    return { isDuplicate: false };
  }

  // Check if key has expired
  if (newKeyExpiresAt && existingKey.createdAt) {
    const createdAt = new Date(existingKey.createdAt);
    if (createdAt < new Date()) {
      return { isDuplicate: false };
    }
  }

  return {
    isDuplicate: true,
    existingKey,
    reason: 'Idempotency key already exists',
  };
}