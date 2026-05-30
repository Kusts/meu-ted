import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Invoice Entity (REQ-039)
// ─────────────────────────────────────────────────────────────────────────────

export const InvoiceStatus = z.enum(['open', 'closed', 'paid']);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const Invoice = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  cardId: z.string().uuid(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2024),
  status: InvoiceStatus.default('open'),
  closesAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  totalCents: z.number().int().default(0),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Invoice = z.infer<typeof Invoice>;

// Invoice creation input
export const InvoiceCreateInput = z.object({
  householdId: z.string().uuid(),
  cardId: z.string().uuid(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2024),
  closesAt: z.string().datetime(),
  dueAt: z.string().datetime(),
});
export type InvoiceCreateInput = z.infer<typeof InvoiceCreateInput>;