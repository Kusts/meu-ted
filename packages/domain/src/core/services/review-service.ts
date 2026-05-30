// ─────────────────────────────────────────────────────────────────────────────
// Review Service
// Manages transaction review queue
// ─────────────────────────────────────────────────────────────────────────────

import type { IReviewQueueRepository } from '../repositories/review-queue-repository.js';
import type { IFinancialRecordRepository } from '../repositories/financial-record-repository.js';
import type { ReviewEntry, ReviewEntryCreateInput } from '../entities/review-entry.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewServiceDeps {
  reviewQueueRepository: IReviewQueueRepository;
  recordRepository: IFinancialRecordRepository;
}

export interface SubmitForReviewInput {
  householdId: string;
  recordId?: string;
  reason: 'high_value' | 'duplicate' | 'account_not_found' | 'category_conflict' | 'manual_review';
  payload: Record<string, unknown>;
}

export interface SubmitForReviewResult {
  success: boolean;
  entry?: ReviewEntry;
  reason?: string;
}

export interface ApproveResult {
  success: boolean;
  entry?: ReviewEntry;
  reason?: string;
}

export interface RejectResult {
  success: boolean;
  entry?: ReviewEntry;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Review Service
// ─────────────────────────────────────────────────────────────────────────────

export class ReviewService {
  constructor(private deps: ReviewServiceDeps) {}

  /**
   * Submit a transaction for review
   * Creates a review entry and optionally marks the record as 'review' status
   */
  async submitForReview(input: SubmitForReviewInput): Promise<SubmitForReviewResult> {
    // Create review entry
    const createInput: ReviewEntryCreateInput = {
      householdId: input.householdId,
      recordId: input.recordId,
      reason: input.reason,
      originalPayload: input.payload,
    };

    const entry = await this.deps.reviewQueueRepository.create(createInput);

    // If there's a record, mark it as 'review' status
    if (input.recordId) {
      const record = await this.deps.recordRepository.findById(input.recordId);
      if (record && record.status !== 'review') {
        await this.deps.recordRepository.update(input.recordId, { status: 'review' });
      }
    }

    return { success: true, entry };
  }

  /**
   * Approve a review entry
   * Changes status to 'approved' and sets record to 'posted' with confirmedAt
   */
  async approve(entryId: string, userId: string): Promise<ApproveResult> {
    const entry = await this.deps.reviewQueueRepository.findById(entryId);
    if (!entry) {
      return { success: false, reason: 'Entry not found' };
    }
    if (entry.status !== 'pending') {
      return { success: false, reason: `Entry already ${entry.status}` };
    }

    const updated = await this.deps.reviewQueueRepository.updateStatus(
      entryId, 
      'approved', 
      userId
    );

    // Confirm the associated record
    if (entry.recordId) {
      const record = await this.deps.recordRepository.findById(entry.recordId);
      if (record) {
        await this.deps.recordRepository.update(entry.recordId, {
          status: 'posted',
          confirmedAt: new Date().toISOString(),
        });
      }
    }

    return { success: true, entry: updated ?? undefined };
  }

  /**
   * Reject a review entry
   * Changes status to 'rejected' and optionally cancels the record
   */
  async reject(entryId: string, userId: string, cancelRecord = false): Promise<RejectResult> {
    const entry = await this.deps.reviewQueueRepository.findById(entryId);
    if (!entry) {
      return { success: false, reason: 'Entry not found' };
    }
    if (entry.status !== 'pending') {
      return { success: false, reason: `Entry already ${entry.status}` };
    }

    const updated = await this.deps.reviewQueueRepository.updateStatus(
      entryId, 
      'rejected', 
      userId
    );

    // Optionally cancel the associated record
    if (cancelRecord && entry.recordId) {
      const record = await this.deps.recordRepository.findById(entry.recordId);
      if (record) {
        await this.deps.recordRepository.update(entry.recordId, {
          status: 'cancelled',
        });
      }
    }

    return { success: true, entry: updated ?? undefined };
  }

  /**
   * List pending review entries for a household
   */
  async listPending(householdId: string): Promise<ReviewEntry[]> {
    return this.deps.reviewQueueRepository.findPending(householdId);
  }

  /**
   * Get all review entries for a household
   */
  async listAll(householdId: string): Promise<ReviewEntry[]> {
    return this.deps.reviewQueueRepository.findByHouseholdId(householdId);
  }

  /**
   * Get pending count for a household
   */
  async pendingCount(householdId: string): Promise<number> {
    return this.deps.reviewQueueRepository.countPending(householdId);
  }

  /**
   * Get a single entry by ID
   */
  async getEntry(entryId: string): Promise<ReviewEntry | null> {
    return this.deps.reviewQueueRepository.findById(entryId);
  }
}
