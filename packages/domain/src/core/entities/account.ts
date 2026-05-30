import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Account Entity
// ─────────────────────────────────────────────────────────────────────────────

export const AccountType = z.enum(['checking', 'savings', 'credit', 'investment', 'cash']);
export type AccountType = z.infer<typeof AccountType>;

export const AccountScope = z.enum(['shared', 'personal']);
export type AccountScope = z.infer<typeof AccountScope>;

export const Account = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  name: z.string().min(1).max(255),
  type: AccountType,
  ownerUserId: z.string().uuid().nullable(),
  scope: AccountScope.default('shared'),
  initialBalanceCents: z.number().int().default(0), // REQ-010: can be negative
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Account = z.infer<typeof Account>;

// Partial for updates
export const AccountUpdate = z.object({
  name: z.string().min(1).max(255).optional(),
  initialBalanceCents: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type AccountUpdate = z.infer<typeof AccountUpdate>;