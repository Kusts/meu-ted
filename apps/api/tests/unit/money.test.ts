import { describe, expect, it } from 'vitest';
import {
  MAX_MONEY_CENTS,
  nonNegativeMoneyCentsSchema,
  positiveMoneyCentsSchema,
} from '../../src/shared/money.js';
import { createExpenseInputSchema } from '../../src/writes/types.js';
import { cardPurchaseSchema } from '../../src/routes/cards.js';
import { createPayableSchema } from '../../src/routes/payables.js';
import { createGoalSchema } from '../../src/routes/goals.js';
import { createBudgetSchema } from '../../src/routes/budgets.js';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

describe('shared money schema (V4.1 Phase 8, task 8.9)', () => {
  it('exposes a documented domain max of 10^12 cents', () => {
    expect(MAX_MONEY_CENTS).toBe(1_000_000_000_000);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 10.5, 0.1, 1e13, MAX_MONEY_CENTS + 1])(
    'rejects unsafe amount %s',
    (amount) => {
      expect(positiveMoneyCentsSchema.safeParse(amount).success).toBe(false);
    },
  );

  it.each([1, 100, MAX_MONEY_CENTS])('accepts %s', (amount) => {
    expect(positiveMoneyCentsSchema.safeParse(amount).success).toBe(true);
  });

  it('rejects zero/negatives for positive amounts, accepts zero for non-negative', () => {
    expect(positiveMoneyCentsSchema.safeParse(0).success).toBe(false);
    expect(positiveMoneyCentsSchema.safeParse(-5).success).toBe(false);
    expect(nonNegativeMoneyCentsSchema.safeParse(0).success).toBe(true);
    expect(nonNegativeMoneyCentsSchema.safeParse(-5).success).toBe(false);
  });

  it('write boundaries reject unsafe money', () => {
    const expense = {
      description: 'Mercado',
      accountId: UUID_A,
      categoryId: UUID_B,
      date: '2026-09-01',
    };
    expect(createExpenseInputSchema.safeParse({ ...expense, amountCents: 1.5 }).success).toBe(false);
    expect(createExpenseInputSchema.safeParse({ ...expense, amountCents: 10 ** 13 }).success).toBe(false);
    expect(createExpenseInputSchema.safeParse({ ...expense, amountCents: Number.NaN }).success).toBe(false);
    expect(createExpenseInputSchema.safeParse({ ...expense, amountCents: 1000 }).success).toBe(true);

    expect(
      cardPurchaseSchema.safeParse({ accountId: UUID_A, description: 'X', amountCents: 0.5, date: '2026-09-01' }).success,
    ).toBe(false);
    expect(
      createPayableSchema.safeParse({ accountId: UUID_A, description: 'X', amountCents: 10 ** 13, dueDate: '2026-09-01' }).success,
    ).toBe(false);
    expect(
      createGoalSchema.safeParse({ name: 'G', goalType: 'savings', targetAmountCents: Number.POSITIVE_INFINITY, startDate: '2026-09-01' }).success,
    ).toBe(false);
    expect(
      createBudgetSchema.safeParse({ categoryId: UUID_A, name: 'B', amountCents: 99.99, period: 'monthly', startDate: '2026-09-01' }).success,
    ).toBe(false);
  });
});
