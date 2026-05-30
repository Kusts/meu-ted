// ─────────────────────────────────────────────────────────────────────────────
// Household Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { Household } from '@pi-financeiro/domain';
import type { households } from '../schema/index.js';

type DbHouseholdRow = typeof households.$inferInsert;

/**
 * Map domain Household entity to DB row format
 */
export function toDbHousehold(household: Household): DbHouseholdRow {
  return {
    id: household.id,
    name: household.name,
    currency: household.currency as 'BRL',
    timezone: household.timezone as 'America/Sao_Paulo',
    createdAt: new Date(household.createdAt),
    updatedAt: new Date(household.updatedAt),
  };
}

/**
 * Map DB row to domain Household entity
 */
export function fromDbHousehold(row: typeof households.$inferSelect): Household {
  return {
    id: row.id,
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
