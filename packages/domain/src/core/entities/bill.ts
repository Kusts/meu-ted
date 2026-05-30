import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Payable Bill Entity (REQ-016, REQ-017)
// ─────────────────────────────────────────────────────────────────────────────

export const BillStatus = z.enum(['pending', 'paid', 'overdue', 'cancelled']);
export type BillStatus = z.infer<typeof BillStatus>;

export const Bill = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  description: z.string().min(1).max(500),
  amountCents: z.number().int().positive(),
  dueDate: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
  status: BillStatus.default('pending'),
  recordId: z.string().uuid().nullable(),    // Payment record
  recurrenceId: z.string().uuid().nullable(),
  occurrenceId: z.string().uuid().nullable(),
  interestRecordId: z.string().uuid().nullable(), // Late interest (REQ-017)
  originalAmountCents: z.number().int().positive().nullable(), // Before late fee
  paidAmountCents: z.number().int().nullable(), // Actual amount paid
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Bill = z.infer<typeof Bill>;