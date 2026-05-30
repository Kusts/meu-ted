// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Recurrence Occurrence Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, desc, lte } from 'drizzle-orm';
import type { RecurrenceOccurrence, OccurrenceStatus } from '@pi-financeiro/domain';
import type { IRecurrenceOccurrenceRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { recurrenceOccurrences } from '../schema/index.js';
import { toDbRecurrenceOccurrence, fromDbRecurrenceOccurrence } from '../mappers/recurrence.js';

export class DrizzleRecurrenceOccurrenceRepository implements IRecurrenceOccurrenceRepository {
  constructor(private dbClient: DbClient) {}

  async create(occurrence: RecurrenceOccurrence): Promise<RecurrenceOccurrence> {
    const dbRow = toDbRecurrenceOccurrence(occurrence);
    const [inserted] = await this.dbClient.db.insert(recurrenceOccurrences).values(dbRow).returning();
    return fromDbRecurrenceOccurrence(inserted);
  }

  async findById(id: string): Promise<RecurrenceOccurrence | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(recurrenceOccurrences)
      .where(eq(recurrenceOccurrences.id, id))
      .limit(1);
    return row ? fromDbRecurrenceOccurrence(row) : null;
  }

  async findByRecurrenceId(recurrenceId: string): Promise<RecurrenceOccurrence[]> {
    const rows = await this.dbClient.db
      .select()
      .from(recurrenceOccurrences)
      .where(eq(recurrenceOccurrences.recurrenceId, recurrenceId))
      .orderBy(desc(recurrenceOccurrences.occurrenceDate));
    return rows.map(fromDbRecurrenceOccurrence);
  }

  async findPendingByRecurrenceId(recurrenceId: string): Promise<RecurrenceOccurrence[]> {
    const rows = await this.dbClient.db
      .select()
      .from(recurrenceOccurrences)
      .where(and(
        eq(recurrenceOccurrences.recurrenceId, recurrenceId),
        eq(recurrenceOccurrences.status, 'pending')
      ))
      .orderBy(recurrenceOccurrences.occurrenceDate);
    return rows.map(fromDbRecurrenceOccurrence);
  }

  async findOverdueByHouseholdId(householdId: string): Promise<RecurrenceOccurrence[]> {
    const now = new Date();
    const rows = await this.dbClient.db
      .select()
      .from(recurrenceOccurrences)
      .where(and(
        eq(recurrenceOccurrences.householdId, householdId),
        eq(recurrenceOccurrences.status, 'pending'),
        lte(recurrenceOccurrences.occurrenceDate, now)
      ))
      .orderBy(recurrenceOccurrences.occurrenceDate);
    return rows.map(fromDbRecurrenceOccurrence);
  }

  async findByRecurrenceAndDate(recurrenceId: string, occurrenceDate: string): Promise<RecurrenceOccurrence | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(recurrenceOccurrences)
      .where(and(
        eq(recurrenceOccurrences.recurrenceId, recurrenceId),
        eq(recurrenceOccurrences.occurrenceDate, new Date(occurrenceDate))
      ))
      .limit(1);
    return row ? fromDbRecurrenceOccurrence(row) : null;
  }

  async update(
    id: string,
    update: { status?: OccurrenceStatus; recordId?: string | null; billId?: string | null; amountCents?: number; description?: string; editedPolicy?: 'none' | 'single' | 'future' | 'all' }
  ): Promise<RecurrenceOccurrence | null> {
    // Note: amountCents and description are not stored in DB for occurrences
    // They are computed at runtime from the parent recurrence
    const [updated] = await this.dbClient.db
      .update(recurrenceOccurrences)
      .set({
        status: update.status as 'pending' | 'created' | 'skipped',
        recordId: update.recordId,
      })
      .where(eq(recurrenceOccurrences.id, id))
      .returning();
    
    return updated ? fromDbRecurrenceOccurrence(updated) : null;
  }
}
