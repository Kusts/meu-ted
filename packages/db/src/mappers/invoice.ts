// ─────────────────────────────────────────────────────────────────────────────
// Invoice Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { Invoice } from '@pi-financeiro/domain';
import type { invoices } from '../schema/index.js';

type DbInvoiceRow = typeof invoices.$inferInsert;

/**
 * Map domain Invoice entity to DB row format
 */
export function toDbInvoice(invoice: Invoice): DbInvoiceRow {
  return {
    id: invoice.id,
    householdId: invoice.householdId,
    cardId: invoice.cardId,
    periodMonth: invoice.periodMonth,
    periodYear: invoice.periodYear,
    status: invoice.status,
    closesAt: new Date(invoice.closesAt),
    dueAt: new Date(invoice.dueAt),
    totalCents: invoice.totalCents,
    paidAt: invoice.paidAt ? new Date(invoice.paidAt) : null,
    createdAt: new Date(invoice.createdAt),
    updatedAt: new Date(invoice.updatedAt),
  };
}

/**
 * Map DB row to domain Invoice entity
 */
export function fromDbInvoice(row: typeof invoices.$inferSelect): Invoice {
  return {
    id: row.id,
    householdId: row.householdId,
    cardId: row.cardId,
    periodMonth: row.periodMonth,
    periodYear: row.periodYear,
    status: row.status,
    closesAt: row.closesAt instanceof Date ? row.closesAt.toISOString() : String(row.closesAt),
    dueAt: row.dueAt instanceof Date ? row.dueAt.toISOString() : String(row.dueAt),
    totalCents: row.totalCents,
    paidAt: row.paidAt ? (row.paidAt instanceof Date ? row.paidAt.toISOString() : String(row.paidAt)) : null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
