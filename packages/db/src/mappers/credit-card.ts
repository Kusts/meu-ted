// ─────────────────────────────────────────────────────────────────────────────
// Credit Card Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { CreditCard } from '@pi-financeiro/domain';
import type { creditCards } from '../schema/index.js';

type DbCreditCardRow = typeof creditCards.$inferInsert;

/**
 * Map domain CreditCard entity to DB row format
 */
export function toDbCreditCard(card: CreditCard): DbCreditCardRow {
  return {
    id: card.id,
    householdId: card.householdId,
    name: card.name,
    ownerUserId: card.ownerUserId,
    scope: card.scope,
    limitCents: card.limitCents,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    paymentAccountId: card.paymentAccountId,
    active: card.active,
    createdAt: new Date(card.createdAt),
    updatedAt: new Date(card.updatedAt),
  };
}

/**
 * Map DB row to domain CreditCard entity
 */
export function fromDbCreditCard(row: typeof creditCards.$inferSelect): CreditCard {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    ownerUserId: row.ownerUserId,
    scope: row.scope,
    limitCents: row.limitCents,
    closingDay: row.closingDay,
    dueDay: row.dueDay,
    paymentAccountId: row.paymentAccountId,
    active: row.active,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
