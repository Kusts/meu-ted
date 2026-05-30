import type { Recurrence } from '../core/entities/recurrence.js';
import type { IRecurrenceRepository } from '../core/repositories/recurrence-repository.js';

export class InMemoryRecurrenceRepository implements IRecurrenceRepository {
  private recurrences: Map<string, Recurrence> = new Map();

  async create(recurrence: Recurrence): Promise<Recurrence> {
    this.recurrences.set(recurrence.id, { ...recurrence });
    return { ...recurrence };
  }

  async findById(id: string): Promise<Recurrence | null> {
    return this.recurrences.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Recurrence[]> {
    return Array.from(this.recurrences.values()).filter(
      r => r.householdId === householdId
    );
  }

  async findActiveByHouseholdId(householdId: string): Promise<Recurrence[]> {
    return Array.from(this.recurrences.values()).filter(
      r => r.householdId === householdId && r.active
    );
  }

  async findHouseholdsWithActiveRecurrences(): Promise<string[]> {
    const households = new Set<string>();
    for (const r of this.recurrences.values()) {
      if (r.active) {
        households.add(r.householdId);
      }
    }
    return Array.from(households);
  }

  async update(id: string, update: Partial<Recurrence>): Promise<Recurrence | null> {
    const existing = this.recurrences.get(id);
    if (!existing) return null;

    const updated: Recurrence = {
      ...existing,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.recurrences.set(id, updated);
    return { ...updated };
  }
}