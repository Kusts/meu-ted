// ─────────────────────────────────────────────────────────────────────────────
// Idempotency Key Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { IdempotencyKey } from '@pi-financeiro/domain';
import type { idempotencyKeys } from '../schema/index.js';

type DbIdempotencyRow = typeof idempotencyKeys.$inferInsert;

/**
 * Map domain IdempotencyKey entity to DB row format
 */
export function toDbIdempotencyKey(key: IdempotencyKey): DbIdempotencyRow {
  return {
    id: key.id,
    householdId: key.householdId,
    key: key.key,
    scope: key.scope,
    createdAt: new Date(key.createdAt),
    expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
  };
}

/**
 * Map DB row to domain IdempotencyKey entity
 */
export function fromDbIdempotencyKey(row: typeof idempotencyKeys.$inferSelect): IdempotencyKey {
  return {
    id: row.id,
    householdId: row.householdId,
    key: row.key,
    scope: row.scope,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    expiresAt: row.expiresAt 
      ? (row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt))
      : null,
  };
}
