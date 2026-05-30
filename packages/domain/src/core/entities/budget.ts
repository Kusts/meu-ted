import { z } from 'zod';

export const BudgetType = z.enum(['category_monthly', 'account_goal', 'custom']);
export type BudgetType = z.infer<typeof BudgetType>;

export const Budget = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string().min(1).max(255),
  budgetType: BudgetType,
  targetId: z.string().uuid().nullable(),
  targetType: z.enum(['category', 'account']).nullable(),
  amountCents: z.number().int().positive(),
  periodStart: z.string().datetime().nullable(),
  periodEnd: z.string().datetime().nullable(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Budget = z.infer<typeof Budget>;