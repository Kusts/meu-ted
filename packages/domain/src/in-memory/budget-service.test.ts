import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetService } from '../core/services/budget-service';
import { InMemoryBudgetRepository } from './budget-repository';
import type { BudgetType } from '../core/entities/budget';

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeBudget(overrides: Partial<{
  id: string;
  householdId: string;
  name: string;
  budgetType: BudgetType;
  targetId: string | null;
  targetType: 'category' | 'account' | null;
  amountCents: number;
  active: boolean;
}> = {}): any {
  return {
    id: uuid(),
    householdId: uuid(),
    name: 'Test Budget',
    budgetType: 'category_monthly',
    targetId: null,
    targetType: null,
    amountCents: 500000, // R$5000
    active: true,
    ...overrides,
  } as any;
}

describe('BudgetService', () => {
  let repo: InMemoryBudgetRepository;
  let service: BudgetService;

  beforeEach(() => {
    repo = new InMemoryBudgetRepository();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new BudgetService(repo as any);
  });

  describe('createBudget', () => {
    it('creates a budget with correct fields', async () => {
      const params = makeBudget({ name: 'Alimentação Mensal', amountCents: 200000 });
      
      const result = await service.createBudget(params);
      
      expect(result.name).toBe('Alimentação Mensal');
      expect(result.amountCents).toBe(200000);
      expect(result.active).toBe(true);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('sets period dates for monthly budgets', async () => {
      const params = makeBudget({ budgetType: 'category_monthly' });
      
      const result = await service.createBudget(params);
      
      expect(result.periodStart).toBeDefined();
      expect(result.periodEnd).toBeDefined();
    });

    it('creates budget with target if provided', async () => {
      const params = makeBudget({ 
        targetId: 'cat-123', 
        targetType: 'category',
      });
      
      const result = await service.createBudget(params);
      
      expect(result.targetId).toBe('cat-123');
      expect(result.targetType).toBe('category');
    });
  });

  describe('listByHousehold', () => {
    it('returns all budgets for household', async () => {
      await service.createBudget(makeBudget({ householdId: 'house-1', name: 'Budget 1' }));
      await service.createBudget(makeBudget({ householdId: 'house-1', name: 'Budget 2' }));
      await service.createBudget(makeBudget({ householdId: 'house-2', name: 'Budget 3' }));
      
      const result = await service.listByHousehold('house-1');
      
      expect(result).toHaveLength(2);
      expect(result.map(b => b.name)).toContain('Budget 1');
      expect(result.map(b => b.name)).toContain('Budget 2');
    });

    it('returns empty array for household with no budgets', async () => {
      const result = await service.listByHousehold('non-existent');
      expect(result).toHaveLength(0);
    });
  });

  describe('getBudgetStatus', () => {
    it('returns under_budget when spent < amount', async () => {
      const budget = await service.createBudget(makeBudget({ amountCents: 100000 }));
      
      const status = await service.getBudgetStatus(budget.id, 50000);
      
      expect(status.status).toBe('under_budget');
      expect(status.spentCents).toBe(50000);
      expect(status.remainingCents).toBe(50000);
    });

    it('returns over_budget when spent > amount', async () => {
      const budget = await service.createBudget(makeBudget({ amountCents: 100000 }));
      
      const status = await service.getBudgetStatus(budget.id, 150000);
      
      expect(status.status).toBe('over_budget');
      expect(status.spentCents).toBe(150000);
      expect(status.remainingCents).toBe(-50000);
    });

    it('returns warning when spent >= 80% of amount', async () => {
      const budget = await service.createBudget(makeBudget({ amountCents: 100000 }));
      
      const status = await service.getBudgetStatus(budget.id, 85000);
      
      expect(status.status).toBe('warning');
      expect(status.percentage).toBe(85);
    });

    it('returns warning when spent = 100%', async () => {
      const budget = await service.createBudget(makeBudget({ amountCents: 100000 }));
      
      const status = await service.getBudgetStatus(budget.id, 100000);
      
      expect(status.status).toBe('warning');
    });
  });
});