import type { RecurrenceOccurrence, OccurrenceStatus } from '../entities/recurrence.js';

/**
 * Recurrence Occurrence Repository Port (REQ-015)
 * Unique constraint on (recurrence_id, occurrence_date)
 */
export interface IRecurrenceOccurrenceRepository {
  create(occurrence: RecurrenceOccurrence): Promise<RecurrenceOccurrence>;
  findById(id: string): Promise<RecurrenceOccurrence | null>;
  findByRecurrenceId(recurrenceId: string): Promise<RecurrenceOccurrence[]>;
  findPendingByRecurrenceId(recurrenceId: string): Promise<RecurrenceOccurrence[]>;
  findOverdueByHouseholdId(householdId: string): Promise<RecurrenceOccurrence[]>;
  findByRecurrenceAndDate(recurrenceId: string, occurrenceDate: string): Promise<RecurrenceOccurrence | null>;
  update(id: string, update: { status?: OccurrenceStatus; recordId?: string | null; billId?: string | null; amountCents?: number; description?: string; editedPolicy?: 'none' | 'single' | 'future' | 'all' }): Promise<RecurrenceOccurrence | null>;
}