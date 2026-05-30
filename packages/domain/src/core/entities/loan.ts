import { z } from 'zod';

export const LoanMode = z.enum(['fixed', 'price', 'sac', 'custom']);
export type LoanMode = z.infer<typeof LoanMode>;

export const LoanInstallmentStatus = z.enum(['pending', 'paid', 'overdue']);
export type LoanInstallmentStatus = z.infer<typeof LoanInstallmentStatus>;

export const Loan = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string().min(1).max(255),
  principalCents: z.number().int().positive(),
  mode: LoanMode,
  interestRate: z.number().int().nullable(), // basis points/month (100=1%)
  startDate: z.string().datetime(),
  installmentsCount: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Loan = z.infer<typeof Loan>;

export const LoanInstallment = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  loanId: z.string().uuid(),
  dueDate: z.string().datetime(),
  principalCents: z.number().int().nonnegative(),
  interestCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  status: LoanInstallmentStatus.default('pending'),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type LoanInstallment = z.infer<typeof LoanInstallment>;