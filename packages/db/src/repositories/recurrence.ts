// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Recurrence Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, desc } from 'drizzle-orm';
import type { Recurrence } from '@pi-financeiro/domain';
import type { IRecurrenceRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { recurrences } from '../schema/index.js';
import { toDbRecurrence, fromDbRecurrence } from '../mappers/recurrence.js';

export class DrizzleRecurrenceRepository implements IRecurrenceRepository {
  constructor(private dbClient: DbClient) {}

  async create(recurrence: Recurrence): Promise<Recurrence> {
    const dbRow = toDbRecurrence(recurrence);
    const [inserted] = await this.dbClient.db.insert(recurrences).values(dbRow).returning();
    return fromDbRecurrence(inserted);
  }

  async findById(id: string): Promise<Recurrence | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, id))
      .limit(1);
    return row ? fromDbRecurrence(row) : null;
  }

  async findByHouseholdId(householdId: string): Promise<Recurrence[]> {
    const rows = await this.dbClient.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.householdId, householdId))
      .orderBy(desc(recurrences.createdAt));
    return rows.map(fromDbRecurrence);
  }

  async findActiveByHouseholdId(householdId: string): Promise<Recurrence[]> {
    const rows = await this.dbClient.db
      .select()
      .from(recurrences)
      .where(and(eq(recurrences.householdId, householdId), eq(recurrences.active, true)))
      .orderBy(desc(recurrences.createdAt));
    return rows.map(fromDbRecurrence);
  }

  async findHouseholdsWithActiveRecurrences(): Promise<string[]> {
    const rows = await this.dbClient.db
      .select({ householdId: recurrences.householdId })
      .from(recurrences)
      .where(eq(recurrences.active, true));
    
    const unique = new Set<string>();
    for (const row of rows) {
      unique.add(row.householdId);
    }
    return Array.from(unique);
  }

  async update(id: string, update: Partial<Recurrence>): Promise<Recurrence | null> {
    const updateData: Partial<typeof recurrences.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (update.description !== undefined) updateData.description = update.description;
    if (update.amountCents !== undefined) updateData.amountCents = update.amountCents;
    if (update.period !== undefined) updateData.period = update.period;
    if (update.targetType !== undefined) updateData.targetType = update.targetType as 'income' | 'expense' | 'transfer' | 'interest' | 'adjustment';
    if (update.accountId !== undefined) updateData.accountId = update.accountId;
    if (update.cardId !== undefined) updateData.cardId = update.cardId;
    if (update.categoryId !== undefined) updateData.categoryId = update.categoryId;
    if (update.firstDate !== undefined) updateData.nextDate = new Date(update.firstDate);
    if (update.horizonMonths !== undefined) updateData.horizonMonths = update.horizonMonths;
    if (update.active !== undefined) updateData.active = update.active;

    const [updated] = await this.dbClient.db
      .update(recurrences)
      .set(updateData)
      .where(eq(recurrences.id, id))
      .returning();
    
    return updated ? fromDbRecurrence(updated) : null;
  }
}
