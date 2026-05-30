import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency Key Entity (REQ-032)
// ─────────────────────────────────────────────────────────────────────────────

export const IdempotencyKey = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  key: z.string().min(1).max(255),
  scope: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime().nullable(),
});
export type IdempotencyKey = z.infer<typeof IdempotencyKey>;

// Idempotency key creation input
export const IdempotencyKeyCreateInput = z.object({
  householdId: z.string().uuid(),
  key: z.string().min(1).max(255),
  scope: z.string().min(1).max(100),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type IdempotencyKeyCreateInput = z.infer<typeof IdempotencyKeyCreateInput>;