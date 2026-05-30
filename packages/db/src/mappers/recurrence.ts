// ─────────────────────────────────────────────────────────────────────────────
// Recurrence & Occurrence Mappers - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { Recurrence, RecurrenceOccurrence } from '@pi-financeiro/domain';
import type { recurrences, recurrenceOccurrences } from '../schema/index.js';

type DbRecurrenceRow = typeof recurrences.$inferInsert;
type DbOccurrenceRow = typeof recurrenceOccurrences.$inferInsert;

// ─── Recurrence ─────────────────────────────────────────────────────────────

/**
 * Map domain Recurrence entity to DB row format
 */
export function toDbRecurrence(recurrence: Recurrence): DbRecurrenceRow {
  return {
    id: recurrence.id,
    householdId: recurrence.householdId,
    description: recurrence.description,
    amountCents: recurrence.amountCents,
    period: recurrence.period,
    targetType: recurrence.targetType as 'income' | 'expense' | 'transfer' | 'interest' | 'adjustment',
    accountId: recurrence.accountId,
    cardId: recurrence.cardId,
    categoryId: recurrence.categoryId,
    nextDate: new Date(recurrence.firstDate),
    horizonMonths: recurrence.horizonMonths,
    active: recurrence.active,
    createdAt: new Date(recurrence.createdAt),
    updatedAt: new Date(recurrence.updatedAt),
  };
}

/**
 * Map DB row to domain Recurrence entity
 */
export function fromDbRecurrence(row: typeof recurrences.$inferSelect): Recurrence {
  return {
    id: row.id,
    householdId: row.householdId,
    description: row.description,
    amountCents: row.amountCents,
    period: row.period,
    targetType: row.targetType as 'payable_bill' | 'account_debit' | 'card_charge',
    accountId: row.accountId,
    cardId: row.cardId,
    categoryId: row.categoryId,
    firstDate: row.nextDate instanceof Date ? row.nextDate.toISOString() : String(row.nextDate),
    horizonMonths: row.horizonMonths,
    active: row.active,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

// ─── Occurrence ──────────────────────────────────────────────────────────────

/**
 * Map domain RecurrenceOccurrence entity to DB row format
 */
export function toDbRecurrenceOccurrence(occurrence: RecurrenceOccurrence): DbOccurrenceRow {
  return {
    id: occurrence.id,
    householdId: occurrence.householdId,
    recurrenceId: occurrence.recurrenceId,
    occurrenceDate: new Date(occurrence.occurrenceDate),
    recordId: occurrence.recordId,
    status: occurrence.status as 'pending' | 'created' | 'skipped',
    editedPolicy: occurrence.editedPolicy as 'single' | 'future' | 'all',
    createdAt: new Date(occurrence.createdAt),
  };
}

/**
 * Map DB row to domain RecurrenceOccurrence entity
 */
export function fromDbRecurrenceOccurrence(row: typeof recurrenceOccurrences.$inferSelect): RecurrenceOccurrence {
  return {
    id: row.id,
    householdId: row.householdId,
    recurrenceId: row.recurrenceId,
    occurrenceDate: row.occurrenceDate instanceof Date ? row.occurrenceDate.toISOString() : String(row.occurrenceDate),
    amountCents: 0,
    description: '',
    recordId: row.recordId,
    billId: null,
    status: row.status as 'pending' | 'processed' | 'overdue' | 'cancelled',
    editedPolicy: row.editedPolicy as 'none' | 'single' | 'future' | 'all',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
