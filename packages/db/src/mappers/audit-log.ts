// ─────────────────────────────────────────────────────────────────────────────
// Audit Log Mapper - Domain Entity <-> Drizzle Row
// ─────────────────────────────────────────────────────────────────────────────

import type { AuditLog } from '@pi-financeiro/domain';
import type { auditLogs } from '../schema/index.js';

type DbAuditLogRow = typeof auditLogs.$inferInsert;

/**
 * Map domain AuditLog entity to DB row format
 */
export function toDbAuditLog(log: AuditLog): DbAuditLogRow {
  return {
    id: log.id,
    householdId: log.householdId,
    actorUserId: log.actorUserId,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    beforeJson: log.beforeJson,
    afterJson: log.afterJson,
    source: log.source,
    createdAt: new Date(log.createdAt),
  };
}

/**
 * Map DB row to domain AuditLog entity
 */
export function fromDbAuditLog(row: typeof auditLogs.$inferSelect): AuditLog {
  return {
    id: row.id,
    householdId: row.householdId,
    actorUserId: row.actorUserId,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    beforeJson: row.beforeJson as AuditLog['beforeJson'],
    afterJson: row.afterJson as AuditLog['afterJson'],
    source: row.source,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
  };
}
