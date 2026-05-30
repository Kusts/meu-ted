import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Entity (REQ-025)
// ─────────────────────────────────────────────────────────────────────────────

export const AuditAction = z.enum(['create', 'update', 'delete', 'undo', 'restore']);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditEntityType = z.enum([
  'financial_record', 'account', 'card', 'invoice', 
  'recurrence', 'category', 'budget', 'loan'
]);
export type AuditEntityType = z.infer<typeof AuditEntityType>;

export const AuditLog = z.object({
  id: z.string().uuid(),
  householdId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable(),
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: z.string().uuid(),
  beforeJson: z.record(z.unknown()).nullable(),
  afterJson: z.record(z.unknown()).nullable(),
  source: z.enum(['whatsapp', 'dashboard', 'cron', 'agent']),
  createdAt: z.string().datetime(),
});
export type AuditLog = z.infer<typeof AuditLog>;

// Audit log creation input
export const AuditLogCreateInput = z.object({
  householdId: z.string().uuid(),
  actorUserId: z.string().uuid().nullable().optional(),
  action: AuditAction,
  entityType: AuditEntityType,
  entityId: z.string().uuid(),
  beforeJson: z.record(z.unknown()).nullable().optional(),
  afterJson: z.record(z.unknown()).nullable().optional(),
  source: z.enum(['whatsapp', 'dashboard', 'cron', 'agent']),
});
export type AuditLogCreateInput = z.infer<typeof AuditLogCreateInput>;