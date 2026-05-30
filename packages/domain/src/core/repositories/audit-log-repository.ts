import type { AuditLog } from '../entities/audit-log.js';

/**
 * Audit Log Repository Port (REQ-025)
 */
export interface IAuditLogRepository {
  create(log: AuditLog): Promise<AuditLog>;
  findByEntityId(entityType: string, entityId: string): Promise<AuditLog[]>;
  findByHouseholdId(householdId: string, limit?: number): Promise<AuditLog[]>;
  findLastByHouseholdId(householdId: string): Promise<AuditLog | null>;
}