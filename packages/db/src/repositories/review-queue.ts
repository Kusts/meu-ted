// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Review Queue Repository
// ─────────────────────────────────────────────────────────────────────────────

import { eq, and, desc } from 'drizzle-orm';
import type { ReviewEntry, ReviewEntryCreateInput, ReviewStatus } from '@pi-financeiro/domain';
import type { IReviewQueueRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { reviewQueue } from '../schema/index.js';
import { fromDbReviewQueue } from '../mappers/review-queue.js';

export class DrizzleReviewQueueRepository implements IReviewQueueRepository {
  constructor(private dbClient: DbClient) {}

  async create(entryInput: ReviewEntryCreateInput): Promise<ReviewEntry> {
    const now = new Date();
    const id = crypto.randomUUID();
    const dbRow = {
      id,
      householdId: entryInput.householdId,
      reason: entryInput.reason,
      payloadJson: entryInput.originalPayload,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    };
    const [inserted] = await this.dbClient.db.insert(reviewQueue).values(dbRow).returning();
    return fromDbReviewQueue(inserted);
  }

  async findById(id: string): Promise<ReviewEntry | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(reviewQueue)
      .where(eq(reviewQueue.id, id))
      .limit(1);
    return row ? fromDbReviewQueue(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<ReviewEntry[]> {
    const rows = await this.dbClient.db
      .select()
      .from(reviewQueue)
      .where(eq(reviewQueue.householdId, householdId))
      .orderBy(desc(reviewQueue.createdAt));
    return rows.map(fromDbReviewQueue);
  }

  async findPending(householdId: string): Promise<ReviewEntry[]> {
    const rows = await this.dbClient.db
      .select()
      .from(reviewQueue)
      .where(and(
        eq(reviewQueue.householdId, householdId),
        eq(reviewQueue.status, 'pending')
      ))
      .orderBy(desc(reviewQueue.createdAt));
    return rows.map(fromDbReviewQueue);
  }

  async findByRecordId(recordId: string): Promise<ReviewEntry | null> {
    // recordId is stored in payloadJson, so we need to filter manually
    const rows = await this.dbClient.db
      .select()
      .from(reviewQueue)
      .orderBy(desc(reviewQueue.createdAt));
    
    const matching = rows.find(r => {
      const payload = r.payloadJson as Record<string, unknown>;
      return payload['recordId'] === recordId;
    });
    
    return matching ? fromDbReviewQueue(matching) : null;
  }

  async updateStatus(id: string, status: ReviewStatus, reviewedByUserId: string): Promise<ReviewEntry | null> {
    const now = new Date();
    const updateData: Partial<typeof reviewQueue.$inferInsert> = {
      status,
      updatedAt: now,
    };

    const [updated] = await this.dbClient.db
      .update(reviewQueue)
      .set(updateData)
      .where(eq(reviewQueue.id, id))
      .returning();
    
    if (!updated) return null;
    
    const entry = fromDbReviewQueue(updated);
    return {
      ...entry,
      reviewedByUserId,
      reviewedAt: now.toISOString(),
    };
  }

  async countPending(householdId: string): Promise<number> {
    const rows = await this.dbClient.db
      .select({ id: reviewQueue.id })
      .from(reviewQueue)
      .where(and(
        eq(reviewQueue.householdId, householdId),
        eq(reviewQueue.status, 'pending')
      ));
    return rows.length;
  }
}
