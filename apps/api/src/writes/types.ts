/**
 * Input shapes for write operations.
 *
 * Zod schemas live alongside the in-memory store; the route layer parses
 * request bodies and calls the store with a typed input. The store
 * enforces invariants (ownership, amount > 0, etc.) and the route
 * layer maps Zod validation errors + DomainError to HTTP.
 */

import { z } from 'zod';

export const createAccountInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['bank', 'cash']),
  initialBalanceCents: z.number().int().nonnegative(),
});
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.name !== undefined, { message: 'patch vazio' });
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

export const createCategoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(['expense', 'income']),
  parentId: z.string().uuid().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((v) => v.name !== undefined, { message: 'patch vazio' });
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const createExpenseInputSchema = z.object({
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  date: isoDate,
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;

export const createIncomeInputSchema = z.object({
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  date: isoDate,
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
});
export type CreateIncomeInput = z.infer<typeof createIncomeInputSchema>;

export const createTransferInputSchema = z.object({
  description: z.string().trim().min(1).max(240),
  amountCents: z.number().int().positive(),
  date: isoDate,
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
});
export type CreateTransferInput = z.infer<typeof createTransferInputSchema>;

/**
 * PATCH /transactions/{id} payload.
 *
 * Per spec: transfer updates are limited to description/date.
 * For expense/income, description/date/amount/account/category are
 * all patchable.
 */
export const updateTransactionInputSchema = z
  .object({
    description: z.string().trim().min(1).max(240).optional(),
    date: isoDate.optional(),
    amountCents: z.number().int().positive().optional(),
    accountId: z.string().uuid().optional(),
    categoryId: z.string().uuid().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'patch vazio' });
export type UpdateTransactionInput = z.infer<typeof updateTransactionInputSchema>;
