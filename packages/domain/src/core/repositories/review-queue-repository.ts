// ─────────────────────────────────────────────────────────────────────────────
// Review Queue Repository Port
// ─────────────────────────────────────────────────────────────────────────────

import type { ReviewEntry, ReviewEntryCreateInput, ReviewStatus } from '../entities/review-entry.js';

/**
 * Review Queue Repository Port
 */
export interface IReviewQueueRepository {
  create(entry: ReviewEntryCreateInput): Promise<ReviewEntry>;
  findById(id: string): Promise<ReviewEntry | null>;
  findByHouseholdId(householdId: string): Promise<ReviewEntry[]>;
  findPending(householdId: string): Promise<ReviewEntry[]>;
  findByRecordId(recordId: string): Promise<ReviewEntry | null>;
  updateStatus(id: string, status: ReviewStatus, reviewedByUserId: string): Promise<ReviewEntry | null>;
  countPending(householdId: string): Promise<number>;
}
