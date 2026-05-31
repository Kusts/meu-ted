import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Entry Entity (REQ-033: balance from ledger entries)
// ─────────────────────────────────────────────────────────────────────────────

export const LedgerDirection = z.enum(['debit', 'credit']);
export type LedgerDirection = z.infer<typeof LedgerDirection>;

export const LedgerEntryType = z.enum(['cash', 'card_charge', 'invoice_payment', 'transfer', 'interest', 'adjustment', 'recurrence', 'reimbursement']);
export type LedgerEntryType = z.infer<typeof LedgerEntryType>;

export const LedgerEntry = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  recordId: z.string().uuid(),
  accountId: z.string().uuid().nullable(),
  cardId: z.string().uuid().nullable(),
  invoiceId: z.string().uuid().nullable(),
  direction: LedgerDirection,
  amountCents: z.number().int(),
  effectiveDate: z.string().datetime(),
  entryType: LedgerEntryType,
  createdAt: z.string().datetime(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

// Ledger entry creation (without generated fields)
export const LedgerEntryCreateInput = z.object({
  householdId: z.string().uuid(),
  recordId: z.string().uuid(),
  accountId: z.string().uuid().nullable().optional(),
  cardId: z.string().uuid().nullable().optional(),
  invoiceId: z.string().uuid().nullable().optional(),
  direction: LedgerDirection,
  amountCents: z.number().int().min(1),
  effectiveDate: z.string().datetime(),
  entryType: LedgerEntryType,
});
export type LedgerEntryCreateInput = z.infer<typeof LedgerEntryCreateInput>;