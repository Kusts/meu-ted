import type { Budget } from '../core/entities/budget';
import type { IBudgetRepository } from '../core/repositories/budget-repository';

export class InMemoryBudgetRepository implements IBudgetRepository {
  private budgets: Budget[] = [];

  async findById(id: string): Promise<Budget | null> {
    return this.budgets.find(b => b.id === id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Budget[]> {
    return this.budgets.filter(b => b.householdId === householdId);
  }

  async create(budget: Budget): Promise<Budget> {
    this.budgets.push(budget);
    return budget;
  }

  async update(budget: Budget): Promise<Budget> {
    const idx = this.budgets.findIndex(b => b.id === budget.id);
    if (idx >= 0) {
      this.budgets[idx] = budget;
    }
    return budget;
  }
}