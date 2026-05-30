// ─────────────────────────────────────────────────────────────────────────────
// Drizzle Audit Log Repository
// ─────────────────────────────────────────────────────────────────────────────

import { and, eq, desc } from 'drizzle-orm';
import type { AuditLog } from '@pi-financeiro/domain';
import type { IAuditLogRepository } from '@pi-financeiro/domain';
import type { DbClient } from '../client.js';
import { auditLogs } from '../schema/index.js';
import { toDbAuditLog, fromDbAuditLog } from '../mappers/audit-log.js';

export class DrizzleAuditLogRepository implements IAuditLogRepository {
  constructor(private dbClient: DbClient) {}

  async create(log: AuditLog): Promise<AuditLog> {
    const dbRow = toDbAuditLog(log);
    const [inserted] = await this.dbClient.db.insert(auditLogs).values(dbRow).returning();
    return fromDbAuditLog(inserted);
  }

  async findByEntityId(entityType: string, entityId: string): Promise<AuditLog[]> {
    const rows = await this.dbClient.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, entityType as any), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt));
    return rows.map(fromDbAuditLog);
  }

  async findByHouseholdId(householdId: string, limit?: number): Promise<AuditLog[]> {
    const baseQuery = this.dbClient.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.householdId, householdId))
      .orderBy(desc(auditLogs.createdAt));
    
    const rows = limit ? await baseQuery.limit(limit) : await baseQuery;
    return rows.map(fromDbAuditLog);
  }

  async findLastByHouseholdId(householdId: string): Promise<AuditLog | null> {
    const [row] = await this.dbClient.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.householdId, householdId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);
    return row ? fromDbAuditLog(row) : null;
  }
}
