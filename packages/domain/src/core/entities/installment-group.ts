import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Installment Group Entity (REQ-013)
// ─────────────────────────────────────────────────────────────────────────────

export const InstallmentGroup = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  description: z.string().min(1).max(500),
  totalCents: z.number().int(),
  installmentsCount: z.number().int().min(1),
  firstDate: z.string().datetime(),
  cardId: z.string().uuid().nullable(),
  accountId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type InstallmentGroup = z.infer<typeof InstallmentGroup>;

// Installment creation input
export const InstallmentGroupCreateInput = z.object({
  householdId: z.string().uuid(),
  description: z.string().min(1).max(500),
  totalCents: z.number().int().min(1),
  installmentsCount: z.number().int().min(1),
  firstDate: z.string().datetime(),
  cardId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
});
export type InstallmentGroupCreateInput = z.infer<typeof InstallmentGroupCreateInput>;