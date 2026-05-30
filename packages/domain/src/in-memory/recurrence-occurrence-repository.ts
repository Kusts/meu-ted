import type { RecurrenceOccurrence, OccurrenceStatus } from '../core/entities/recurrence.js';
import type { IRecurrenceOccurrenceRepository } from '../core/repositories/recurrence-occurrence-repository.js';

export class InMemoryRecurrenceOccurrenceRepository implements IRecurrenceOccurrenceRepository {
  private occurrences: Map<string, RecurrenceOccurrence> = new Map();

  async create(occurrence: RecurrenceOccurrence): Promise<RecurrenceOccurrence> {
    this.occurrences.set(occurrence.id, { ...occurrence });
    return { ...occurrence };
  }

  async findById(id: string): Promise<RecurrenceOccurrence | null> {
    return this.occurrences.get(id) ?? null;
  }

  async findByRecurrenceId(recurrenceId: string): Promise<RecurrenceOccurrence[]> {
    return Array.from(this.occurrences.values()).filter(
      o => o.recurrenceId === recurrenceId
    );
  }

  async findPendingByRecurrenceId(recurrenceId: string): Promise<RecurrenceOccurrence[]> {
    return Array.from(this.occurrences.values()).filter(
      o => o.recurrenceId === recurrenceId && o.status === 'pending'
    );
  }

  async findOverdueByHouseholdId(householdId: string): Promise<RecurrenceOccurrence[]> {
    return Array.from(this.occurrences.values()).filter(
      o => o.householdId === householdId && o.status === 'overdue'
    );
  }

  async findByRecurrenceAndDate(recurrenceId: string, occurrenceDate: string): Promise<RecurrenceOccurrence | null> {
    return Array.from(this.occurrences.values()).find(
      o => o.recurrenceId === recurrenceId && o.occurrenceDate === occurrenceDate
    ) ?? null;
  }

  async update(id: string, update: { status?: OccurrenceStatus; recordId?: string | null; billId?: string | null; amountCents?: number; description?: string; editedPolicy?: 'none' | 'single' | 'future' | 'all' }): Promise<RecurrenceOccurrence | null> {
    const existing = this.occurrences.get(id);
    if (!existing) return null;

    const updated: RecurrenceOccurrence = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.occurrences.set(id, updated);
    return { ...updated };
  }
}