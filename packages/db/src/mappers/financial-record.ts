// ─────────────────────────────────────────────────────────────────────────────
// Financial Record Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { FinancialRecord } from '@pi-financeiro/domain';
import type { financialRecords } from '../schema/index.js';

type DbRecordRow = typeof financialRecords.$inferInsert;

/**
 * Map domain FinancialRecord entity to DB row format
 */
export function toDbFinancialRecord(record: FinancialRecord): DbRecordRow {
  return {
    id: record.id,
    householdId: record.householdId,
    type: record.type,
    amountCents: record.amountCents,
    date: new Date(record.date),
    description: record.description,
    accountId: record.accountId,
    fromAccountId: record.fromAccountId,
    toAccountId: record.toAccountId,
    cardId: record.cardId,
    invoiceId: record.invoiceId,
    categoryId: record.categoryId,
    createdByUserId: record.createdByUserId,
    source: record.source,
    sourceMessageId: record.sourceMessageId,
    idempotencyKey: record.idempotencyKey,
    status: record.status,
    recurrenceId: record.recurrenceId,
    installmentGroupId: record.installmentGroupId,
    relatedRecordId: record.relatedRecordId,
    merchantId: record.merchantId,
    confirmedAt: record.confirmedAt ? new Date(record.confirmedAt) : null,
    metadataJson: record.metadataJson ?? null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

/**
 * Map DB row to domain FinancialRecord entity
 */
export function fromDbFinancialRecord(row: typeof financialRecords.$inferSelect): FinancialRecord {
  return {
    id: row.id,
    householdId: row.householdId,
    type: row.type,
    amountCents: row.amountCents,
    date: row.date instanceof Date ? row.date.toISOString() : String(row.date),
    description: row.description,
    accountId: row.accountId,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    cardId: row.cardId,
    invoiceId: row.invoiceId,
    categoryId: row.categoryId,
    createdByUserId: row.createdByUserId,
    source: row.source,
    sourceMessageId: row.sourceMessageId,
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    recurrenceId: row.recurrenceId,
    installmentGroupId: row.installmentGroupId,
    relatedRecordId: row.relatedRecordId,
    merchantId: row.merchantId,
    confirmedAt: row.confirmedAt 
      ? (row.confirmedAt instanceof Date ? row.confirmedAt.toISOString() : String(row.confirmedAt))
      : null,
    metadataJson: (row.metadataJson ?? null) as Record<string, unknown> | null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
