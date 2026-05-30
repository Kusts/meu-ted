// ─────────────────────────────────────────────────────────────────────────────
// Account Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { Account } from '@pi-financeiro/domain';
import type { accounts } from '../schema/index.js';

type DbAccountRow = typeof accounts.$inferInsert;

/**
 * Map domain Account entity to DB row format
 */
export function toDbAccount(account: Account): DbAccountRow {
  return {
    id: account.id,
    householdId: account.householdId,
    name: account.name,
    type: account.type,
    ownerUserId: account.ownerUserId,
    scope: account.scope,
    initialBalanceCents: account.initialBalanceCents,
    active: account.active,
    createdAt: new Date(account.createdAt),
    updatedAt: new Date(account.updatedAt),
  };
}

/**
 * Map DB row to domain Account entity
 */
export function fromDbAccount(row: typeof accounts.$inferSelect): Account {
  return {
    id: row.id,
    householdId: row.householdId,
    name: row.name,
    type: row.type,
    ownerUserId: row.ownerUserId,
    scope: row.scope,
    initialBalanceCents: row.initialBalanceCents,
    active: row.active,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
