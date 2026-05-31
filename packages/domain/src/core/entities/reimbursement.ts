// ─────────────────────────────────────────────────────────────────────────────
// Reimbursement Entity (REQ-029)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const ReimbursementStatus = z.enum(['pending', 'partial', 'completed']);
export type ReimbursementStatus = z.infer<typeof ReimbursementStatus>;

export const Reimbursement = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  originalRecordId: z.string().uuid(),   // the expense being reimbursed
  reimbursementRecordId: z.string().uuid().nullable(), // the income record (created when reimbursed)
  amountCents: z.number().int().positive(),
  status: ReimbursementStatus,
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Reimbursement = z.infer<typeof Reimbursement>;
