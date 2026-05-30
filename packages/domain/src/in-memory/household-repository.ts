// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Household Repository
// ─────────────────────────────────────────────────────────────────────────────

import type { Household, HouseholdCreate, HouseholdUpdate } from '../core/entities/household.js';
import type { IHouseholdRepository } from '../core/repositories/household-repository.js';

export class InMemoryHouseholdRepository implements IHouseholdRepository {
  private households = new Map<string, Household>();

  async create(householdCreate: HouseholdCreate): Promise<Household> {
    const now = new Date().toISOString();
    const household: Household = {
      id: householdCreate.id,
      name: householdCreate.name,
      currency: householdCreate.currency || 'BRL',
      timezone: householdCreate.timezone || 'America/Sao_Paulo',
      createdAt: now,
      updatedAt: now,
    };
    this.households.set(household.id, household);
    return { ...household };
  }

  async findById(id: string): Promise<Household | null> {
    return this.households.get(id) ?? null;
  }

  async findAll(): Promise<Household[]> {
    return Array.from(this.households.values());
  }

  async update(id: string, update: HouseholdUpdate): Promise<Household | null> {
    const household = this.households.get(id);
    if (!household) return null;

    const updated: Household = {
      ...household,
      ...update,
      updatedAt: new Date().toISOString(),
    };
    this.households.set(id, updated);
    return { ...updated };
  }
}