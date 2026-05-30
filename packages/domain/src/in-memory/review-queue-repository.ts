// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Review Queue Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { IReviewQueueRepository } from '../core/repositories/review-queue-repository.js';
import type { ReviewEntry, ReviewEntryCreateInput, ReviewStatus } from '../core/entities/review-entry.js';

export class InMemoryReviewQueueRepository implements IReviewQueueRepository {
  private entries: Map<string, ReviewEntry> = new Map();

  async create(input: ReviewEntryCreateInput): Promise<ReviewEntry> {
    const now = new Date().toISOString();
    const entry: ReviewEntry = {
      id: crypto.randomUUID(),
      householdId: input.householdId,
      recordId: input.recordId ?? null,
      reason: input.reason,
      status: 'pending',
      originalPayload: input.originalPayload,
      reviewedByUserId: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.set(entry.id, entry);
    return { ...entry };
  }

  async findById(id: string): Promise<ReviewEntry | null> {
    return this.entries.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<ReviewEntry[]> {
    return Array.from(this.entries.values())
      .filter(e => e.householdId === householdId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findPending(householdId: string): Promise<ReviewEntry[]> {
    return Array.from(this.entries.values())
      .filter(e => e.householdId === householdId && e.status === 'pending')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async findByRecordId(recordId: string): Promise<ReviewEntry | null> {
    return Array.from(this.entries.values()).find(
      e => e.recordId === recordId
    ) ?? null;
  }

  async updateStatus(
    id: string, 
    status: ReviewStatus, 
    reviewedByUserId: string
  ): Promise<ReviewEntry | null> {
    const existing = this.entries.get(id);
    if (!existing) return null;

    const updated: ReviewEntry = {
      ...existing,
      status,
      reviewedByUserId,
      reviewedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.entries.set(id, updated);
    return { ...updated };
  }

  async countPending(householdId: string): Promise<number> {
    return Array.from(this.entries.values()).filter(
      e => e.householdId === householdId && e.status === 'pending'
    ).length;
  }
}
