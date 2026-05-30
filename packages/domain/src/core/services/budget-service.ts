import type { Budget } from '../entities/budget';
import type { IBudgetRepository } from '../repositories/budget-repository';

export interface CreateBudgetParams {
  householdId: string;
  name: string;
  budgetType: 'category_monthly' | 'account_goal' | 'custom';
  targetId?: string | null;
  targetType?: 'category' | 'account' | null;
  amountCents: number;
}

export interface BudgetStatusResult {
  budget: Budget;
  spentCents: number;
  remainingCents: number;
  percentage: number;
  status: 'under_budget' | 'warning' | 'over_budget';
}

export class BudgetService {
  constructor(private readonly budgetRepo: IBudgetRepository) {}

  async createBudget(params: CreateBudgetParams): Promise<Budget> {
    const now = new Date().toISOString();
    
    let periodStart: string | null = null;
    let periodEnd: string | null = null;
    
    if (params.budgetType === 'category_monthly') {
      const nowDate = new Date();
      const start = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1);
      const end = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0);
      periodStart = start.toISOString();
      periodEnd = end.toISOString();
    }

    const budget: Budget = {
      id: crypto.randomUUID(),
      householdId: params.householdId,
      name: params.name,
      budgetType: params.budgetType,
      targetId: params.targetId ?? null,
      targetType: params.targetType ?? null,
      amountCents: params.amountCents,
      periodStart,
      periodEnd,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    return this.budgetRepo.create(budget);
  }

  async listByHousehold(householdId: string): Promise<Budget[]> {
    return this.budgetRepo.findByHouseholdId(householdId);
  }

  async getBudgetStatus(budgetId: string, spentCents: number): Promise<BudgetStatusResult> {
    const budget = await this.budgetRepo.findById(budgetId);
    if (!budget) {
      throw new Error('Budget not found');
    }

    const remainingCents = budget.amountCents - spentCents;
    const percentage = Math.round((spentCents / budget.amountCents) * 100);

    let status: 'under_budget' | 'warning' | 'over_budget';
    if (remainingCents < 0) {
      status = 'over_budget';
    } else if (percentage >= 80) {
      status = 'warning';
    } else {
      status = 'under_budget';
    }

    return {
      budget,
      spentCents,
      remainingCents,
      percentage,
      status,
    };
  }
}