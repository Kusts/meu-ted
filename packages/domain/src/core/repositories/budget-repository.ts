import type { Budget } from '../entities/budget';

export interface IBudgetRepository {
  findById(id: string): Promise<Budget | null>;
  findByHouseholdId(householdId: string): Promise<Budget[]>;
  create(budget: Budget): Promise<Budget>;
  update(budget: Budget): Promise<Budget>;
}