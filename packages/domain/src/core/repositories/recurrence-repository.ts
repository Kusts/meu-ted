import type { Recurrence } from '../entities/recurrence.js';

/**
 * Recurrence Repository Port (REQ-014)
 */
export interface IRecurrenceRepository {
  create(recurrence: Recurrence): Promise<Recurrence>;
  findById(id: string): Promise<Recurrence | null>;
  findByHouseholdId(householdId: string): Promise<Recurrence[]>;
  findActiveByHouseholdId(householdId: string): Promise<Recurrence[]>;
  findHouseholdsWithActiveRecurrences(): Promise<string[]>;
  update(id: string, update: Partial<Recurrence>): Promise<Recurrence | null>;
}