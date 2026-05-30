// Idempotency package - re-exports from domain and provides scope constants

import type { IdempotencyKey } from '@pi-financeiro/domain';

export { IdempotencyKey };
export type { IdempotencyKey as IdempotencyKeyType } from '@pi-financeiro/domain';

/**
 * Idempotency service for preventing duplicate operations
 * REQ-032: system shall ignore already-processed source_message_id values
 */

// Scope constants for different operation types
export const IDEMPOTENCY_SCOPES = {
  SOURCE_MESSAGE: 'source_message',
  WHATSAPP_MESSAGE: 'whatsapp_message',
  CRON_RECURRENCE: 'cron_recurrence',
  TOOL_EXECUTION: 'tool_execution',
  INVOICE_CLOSE: 'invoice_close',
  TRANSFER: 'transfer',
} as const;

export type IdempotencyScope = typeof IDEMPOTENCY_SCOPES[keyof typeof IDEMPOTENCY_SCOPES];

/**
 * Create a idempotency key for WhatsApp message deduplication
 * REQ-032: webhook retry with same source_message_id should be ignored
 */
export function createWhatsAppIdempotencyKey(
  provider: string,
  providerMessageId: string
): string {
  return `whatsapp_${provider}_${providerMessageId}`;
}

/**
 * Create a idempotency key for cron recurrence processing
 * REQ-015: system shall create only missing occurrences
 */
export function createRecurrenceIdempotencyKey(
  recurrenceId: string,
  occurrenceDate: Date
): string {
  const dateStr = occurrenceDate.toISOString().split('T')[0];
  return `recurrence_${recurrenceId}_${dateStr}`;
}

/**
 * Create a idempotency key for invoice closing
 * REQ-006: idempotency - close invoice twice doesn't duplicate
 */
export function createInvoiceCloseIdempotencyKey(
  cardId: string,
  periodMonth: number,
  periodYear: number
): string {
  return `invoice_close_${cardId}_${periodYear}_${periodMonth.toString().padStart(2, '0')}`;
}

/**
 * Create a idempotency key for transfer operations
 * REQ-034: transfer generates debit + credit entries
 */
export function createTransferIdempotencyKey(
  fromAccountId: string,
  toAccountId: string,
  amountCents: number,
  effectiveDate: Date
): string {
  const dateStr = effectiveDate.toISOString().split('T')[0];
  return `transfer_${fromAccountId}_${toAccountId}_${amountCents}_${dateStr}`;
}

// Re-export domain check function
export { checkIdempotencyKey } from '@pi-financeiro/domain';
export type { DuplicateCheckResult } from '@pi-financeiro/domain';