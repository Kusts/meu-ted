// ─────────────────────────────────────────────────────────────────────────────
// Attachment Entity (REQ-027/040)
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const AttachmentEntityType = z.enum([
  'financial_record',
  'account',
  'card',
  'invoice',
  'recurrence',
  'category',
  'budget',
  'loan',
]);
export type AttachmentEntityType = z.infer<typeof AttachmentEntityType>;

export const Attachment = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  entityType: AttachmentEntityType,
  entityId: z.string().uuid(),
  filePath: z.string().min(1),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().int().nonnegative().nullable(),
  originalName: z.string().nullable(),
  uploadedByUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
});
export type Attachment = z.infer<typeof Attachment>;
