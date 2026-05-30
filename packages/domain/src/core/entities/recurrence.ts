import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Recurrence Entity (REQ-014, REQ-015, REQ-018)
// ─────────────────────────────────────────────────────────────────────────────

export const RecurrencePeriod = z.enum(['daily', 'weekly', 'biweekly', 'monthly', 'yearly']);
export type RecurrencePeriod = z.infer<typeof RecurrencePeriod>;

export const RecurrenceTargetType = z.enum(['payable_bill', 'account_debit', 'card_charge']);
export type RecurrenceTargetType = z.infer<typeof RecurrenceTargetType>;

export const Recurrence = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  description: z.string().min(1).max(500),
  amountCents: z.number().int().positive(),
  period: RecurrencePeriod,
  targetType: RecurrenceTargetType,
  accountId: z.string().uuid().nullable(),
  cardId: z.string().uuid().nullable(),
  categoryId: z.string().uuid().nullable(),
  firstDate: z.string().datetime(),
  horizonMonths: z.number().int().positive().default(12),
  active: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Recurrence = z.infer<typeof Recurrence>;

// ─────────────────────────────────────────────────────────────────────────────
// Recurrence Occurrence Entity
// Unique constraint on (recurrence_id, occurrence_date)
// ─────────────────────────────────────────────────────────────────────────────

export const OccurrenceStatus = z.enum(['pending', 'processed', 'overdue', 'cancelled']);
export type OccurrenceStatus = z.infer<typeof OccurrenceStatus>;

export const EditedPolicy = z.enum(['none', 'single', 'future', 'all']);
export type EditedPolicy = z.infer<typeof EditedPolicy>;

export const RecurrenceOccurrence = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  recurrenceId: z.string().uuid(),
  occurrenceDate: z.string().datetime(),
  amountCents: z.number().int().positive(), // Current amount (may differ if edited)
  description: z.string().min(1).max(500),  // Current description
  recordId: z.string().uuid().nullable(),   // Created financial_record
  billId: z.string().uuid().nullable(),     // Created bill (for payable_bill)
  status: OccurrenceStatus.default('pending'),
  editedPolicy: EditedPolicy.default('none'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RecurrenceOccurrence = z.infer<typeof RecurrenceOccurrence>;