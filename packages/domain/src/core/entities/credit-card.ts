import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Credit Card Entity (REQ-011)
// ─────────────────────────────────────────────────────────────────────────────

export const CardScope = z.enum(['shared', 'personal']);
export type CardScope = z.infer<typeof CardScope>;

export const CreditCard = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string().min(1).max(255),
  ownerUserId: z.string().uuid().nullable(),
  scope: CardScope.default('shared'),
  limitCents: z.number().int().nullable(),
  closingDay: z.number().int().min(1).max(31), // 1..31
  dueDay: z.number().int().min(1).max(31),    // 1..31
  paymentAccountId: z.string().uuid().nullable(),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CreditCard = z.infer<typeof CreditCard>;

// Partial for updates
export const CreditCardUpdate = z.object({
  name: z.string().min(1).max(255).optional(),
  limitCents: z.number().int().nullable().optional(),
  closingDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  active: z.boolean().optional(),
});
export type CreditCardUpdate = z.infer<typeof CreditCardUpdate>;