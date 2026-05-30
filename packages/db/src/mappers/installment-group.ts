// ─────────────────────────────────────────────────────────────────────────────
// Installment Group Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { InstallmentGroup } from '@pi-financeiro/domain';
import type { installmentGroups } from '../schema/index.js';

type DbInstallmentGroupRow = typeof installmentGroups.$inferInsert;

/**
 * Map domain InstallmentGroup entity to DB row format
 */
export function toDbInstallmentGroup(group: InstallmentGroup): DbInstallmentGroupRow {
  return {
    id: group.id,
    householdId: group.householdId,
    description: group.description,
    totalCents: group.totalCents,
    installmentsCount: group.installmentsCount,
    firstDate: new Date(group.firstDate),
    cardId: group.cardId,
    accountId: group.accountId,
    createdAt: new Date(group.createdAt),
  };
}

/**
 * Map DB row to domain InstallmentGroup entity
 */
export function fromDbInstallmentGroup(row: typeof installmentGroups.$inferSelect): InstallmentGroup {
  return {
    id: row.id,
    householdId: row.householdId,
    description: row.description,
    totalCents: row.totalCents,
    installmentsCount: row.installmentsCount,
    firstDate: row.firstDate instanceof Date ? row.firstDate.toISOString() : String(row.firstDate),
    cardId: row.cardId,
    accountId: row.accountId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
