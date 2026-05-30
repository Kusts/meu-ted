// ─────────────────────────────────────────────────────────────────────────────
// Household Repository Interface
// ─────────────────────────────────────────────────────────────────────────────

import type { Household, HouseholdCreate, HouseholdUpdate } from '../entities/household.js';

export interface IHouseholdRepository {
  create(household: HouseholdCreate): Promise<Household>;
  findById(id: string): Promise<Household | null>;
  findAll(): Promise<Household[]>;
  update(id: string, update: HouseholdUpdate): Promise<Household | null>;
}