import type { AuditLog } from '../core/entities/audit-log.js';
import type { IAuditLogRepository } from '../core/repositories/audit-log-repository.js';

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private logs: Map<string, AuditLog> = new Map();

  async create(log: AuditLog): Promise<AuditLog> {
    this.logs.set(log.id, { ...log });
    return { ...log };
  }

  async findByEntityId(entityType: string, entityId: string): Promise<AuditLog[]> {
    return Array.from(this.logs.values())
      .filter(l => l.entityType === entityType && l.entityId === entityId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async findByHouseholdId(householdId: string, limit?: number): Promise<AuditLog[]> {
    const results = Array.from(this.logs.values())
      .filter(l => l.householdId === householdId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return limit ? results.slice(0, limit) : results;
  }

  async findLastByHouseholdId(householdId: string): Promise<AuditLog | null> {
    const logs = await this.findByHouseholdId(householdId, 1);
    return logs[0] ?? null;
  }
}