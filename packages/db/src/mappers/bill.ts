// ─────────────────────────────────────────────────────────────────────────────
// Bill Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { Bill } from '@pi-financeiro/domain';
import type { bills } from '../schema/index.js';

type DbBillRow = typeof bills.$inferInsert;

/**
 * Map domain Bill entity to DB row format
 */
export function toDbBill(bill: Bill): DbBillRow {
  return {
    id: bill.id,
    householdId: bill.householdId,
    description: bill.description,
    amountCents: bill.amountCents,
    dueDate: new Date(bill.dueDate),
    paidAt: bill.paidAt ? new Date(bill.paidAt) : null,
    status: bill.status,
    recordId: bill.recordId,
    recurrenceId: bill.recurrenceId,
    createdAt: new Date(bill.createdAt),
    updatedAt: new Date(bill.updatedAt),
  };
}

/**
 * Map DB row to domain Bill entity
 */
export function fromDbBill(row: typeof bills.$inferSelect): Bill {
  return {
    id: row.id,
    householdId: row.householdId,
    description: row.description,
    amountCents: row.amountCents,
    dueDate: row.dueDate instanceof Date ? row.dueDate.toISOString() : String(row.dueDate),
    paidAt: row.paidAt ? (row.paidAt instanceof Date ? row.paidAt.toISOString() : String(row.paidAt)) : null,
    status: row.status,
    recordId: row.recordId,
    recurrenceId: row.recurrenceId,
    occurrenceId: null,
    interestRecordId: null,
    originalAmountCents: null,
    paidAmountCents: null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
