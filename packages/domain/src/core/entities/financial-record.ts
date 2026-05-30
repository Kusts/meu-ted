import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Financial Record Entity
// ─────────────────────────────────────────────────────────────────────────────

export const RecordType = z.enum(['income', 'expense', 'transfer', 'interest', 'adjustment']);
export type RecordType = z.infer<typeof RecordType>;

export const RecordSource = z.enum(['whatsapp', 'dashboard', 'cron', 'agent']);
export type RecordSource = z.infer<typeof RecordSource>;

export const RecordStatus = z.enum(['posted', 'scheduled', 'paid', 'overdue', 'cancelled', 'review']);
export type RecordStatus = z.infer<typeof RecordStatus>;

export const FinancialRecord = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  type: RecordType,
  amountCents: z.number().int(),
  date: z.string().datetime(),
  description: z.string().min(1).max(500),
  accountId: z.string().uuid().nullable(),
  fromAccountId: z.string().uuid().nullable(),
  toAccountId: z.string().uuid().nullable(),
  cardId: z.string().uuid().nullable(),
  invoiceId: z.string().uuid().nullable(),
  categoryId: z.string().uuid().nullable(),
  createdByUserId: z.string().uuid().nullable(),
  source: RecordSource,
  sourceMessageId: z.string().uuid().nullable(), // REQ-032: deduplicate
  idempotencyKey: z.string().max(255).nullable(), // REQ-032: idempotency
  status: RecordStatus.default('posted'),
  recurrenceId: z.string().uuid().nullable(),
  installmentGroupId: z.string().uuid().nullable(),
  relatedRecordId: z.string().uuid().nullable(),
  merchantId: z.string().uuid().nullable(),
  confirmedAt: z.string().datetime().nullable(),
  metadataJson: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FinancialRecord = z.infer<typeof FinancialRecord>;

// Record creation input (without generated fields)
export const RecordCreateInput = z.object({
  householdId: z.string().uuid(),
  type: RecordType,
  amountCents: z.number().int().min(1),
  date: z.string().datetime(),
  description: z.string().min(1).max(500),
  accountId: z.string().uuid().nullable().optional(),
  fromAccountId: z.string().uuid().nullable().optional(),
  toAccountId: z.string().uuid().nullable().optional(),
  cardId: z.string().uuid().nullable().optional(),
  invoiceId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
  source: RecordSource,
  sourceMessageId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().max(255).nullable().optional(),
  status: RecordStatus.default('posted'),
  recurrenceId: z.string().uuid().nullable().optional(),
  installmentGroupId: z.string().uuid().nullable().optional(),
  relatedRecordId: z.string().uuid().nullable().optional(),
  merchantId: z.string().uuid().nullable().optional(),
  metadataJson: z.record(z.unknown()).nullable().optional(),
});
export type RecordCreateInput = z.infer<typeof RecordCreateInput>;

// Partial for updates
export const RecordUpdate = z.object({
  amountCents: z.number().int().min(1).optional(),
  date: z.string().datetime().optional(),
  description: z.string().min(1).max(500).optional(),
  accountId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  status: RecordStatus.optional(),
  confirmedAt: z.string().datetime().nullable().optional(),
});
export type RecordUpdate = z.infer<typeof RecordUpdate>;