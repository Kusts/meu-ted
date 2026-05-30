// ─────────────────────────────────────────────────────────────────────────────
// Review Queue Entity
// Handles high-value transactions, duplicates, and unknown accounts
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Review Reason Enum
// ─────────────────────────────────────────────────────────────────────────────

export const ReviewReason = z.enum([
  'high_value',        // Transaction amount exceeds threshold
  'duplicate',         // Possible duplicate transaction
  'account_not_found',  // Referenced account/card not found
  'category_conflict',  // Category mismatch
  'manual_review',      // Manually flagged for review
]);
export type ReviewReason = z.infer<typeof ReviewReason>;

// ─────────────────────────────────────────────────────────────────────────────
// Review Status Enum
// ─────────────────────────────────────────────────────────────────────────────

export const ReviewStatus = z.enum(['pending', 'approved', 'rejected']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

// ─────────────────────────────────────────────────────────────────────────────
// Review Entry Schema
// ─────────────────────────────────────────────────────────────────────────────

export const ReviewEntry = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  recordId: z.string().uuid().nullable(),        // Associated financial record (if any)
  reason: ReviewReason,
  status: ReviewStatus.default('pending'),
  originalPayload: z.record(z.unknown()),        // JSON snapshot of original input
  reviewedByUserId: z.string().uuid().nullable(),
  reviewedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ReviewEntry = z.infer<typeof ReviewEntry>;

// ─────────────────────────────────────────────────────────────────────────────
// Review Entry Create Input
// ─────────────────────────────────────────────────────────────────────────────

export const ReviewEntryCreateInput = z.object({
  householdId: z.string().uuid(),
  recordId: z.string().uuid().nullable().optional(),
  reason: ReviewReason,
  originalPayload: z.record(z.unknown()),
});
export type ReviewEntryCreateInput = z.infer<typeof ReviewEntryCreateInput>;

// ─────────────────────────────────────────────────────────────────────────────
// Review Decision Input
// ─────────────────────────────────────────────────────────────────────────────

export const ReviewDecisionInput = z.object({
  userId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});
export type ReviewDecisionInput = z.infer<typeof ReviewDecisionInput>;
