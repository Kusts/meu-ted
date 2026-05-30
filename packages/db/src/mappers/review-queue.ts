// ─────────────────────────────────────────────────────────────────────────────
// Review Queue Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { ReviewEntry } from '@pi-financeiro/domain';
import type { reviewQueue } from '../schema/index.js';

type DbReviewQueueRow = typeof reviewQueue.$inferInsert;

/**
 * Map domain ReviewEntry entity to DB row format
 */
export function toDbReviewQueue(entry: ReviewEntry): DbReviewQueueRow {
  return {
    id: entry.id,
    householdId: entry.householdId,
    reason: entry.reason,
    payloadJson: entry.originalPayload,
    status: entry.status,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
  };
}

/**
 * Map DB row to domain ReviewEntry entity
 */
export function fromDbReviewQueue(row: typeof reviewQueue.$inferSelect): ReviewEntry {
  return {
    id: row.id,
    householdId: row.householdId,
    recordId: null,
    reason: row.reason as ReviewEntry['reason'],
    status: row.status,
    originalPayload: row.payloadJson as Record<string, unknown>,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}
