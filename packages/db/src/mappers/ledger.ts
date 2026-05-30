// ─────────────────────────────────────────────────────────────────────────────
// Ledger Entry Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { LedgerEntry } from '@pi-financeiro/domain';
import type { ledgerEntries } from '../schema/index.js';

type DbLedgerRow = typeof ledgerEntries.$inferInsert;

/**
 * Map domain LedgerEntry entity to DB row format
 */
export function toDbLedgerEntry(entry: LedgerEntry): DbLedgerRow {
  return {
    id: entry.id,
    householdId: entry.householdId,
    recordId: entry.recordId,
    accountId: entry.accountId,
    cardId: entry.cardId,
    invoiceId: entry.invoiceId,
    direction: entry.direction,
    amountCents: entry.amountCents,
    effectiveDate: new Date(entry.effectiveDate),
    entryType: entry.entryType,
    createdAt: new Date(entry.createdAt),
  };
}

/**
 * Map DB row to domain LedgerEntry entity
 */
export function fromDbLedgerEntry(row: typeof ledgerEntries.$inferSelect): LedgerEntry {
  return {
    id: row.id,
    householdId: row.householdId,
    recordId: row.recordId,
    accountId: row.accountId,
    cardId: row.cardId,
    invoiceId: row.invoiceId,
    direction: row.direction,
    amountCents: row.amountCents,
    effectiveDate: row.effectiveDate instanceof Date ? row.effectiveDate.toISOString() : String(row.effectiveDate),
    entryType: row.entryType,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
