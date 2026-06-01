import type { Backup } from '../core/entities/backup.js';
import type { IBackupRepository } from '../core/repositories/backup-repository.js';

export class InMemoryBackupRepository implements IBackupRepository {
  private backups: Map<string, Backup> = new Map();

  async create(backup: Backup): Promise<Backup> {
    this.backups.set(backup.id, backup);
    return backup;
  }

  async findById(id: string): Promise<Backup | null> {
    return this.backups.get(id) ?? null;
  }

  async findByHouseholdId(householdId: string): Promise<Backup[]> {
    return [...this.backups.values()].filter(b => b.householdId === householdId);
  }

  async updateRestoreVerified(id: string, verifiedAt: string): Promise<Backup | null> {
    const backup = this.backups.get(id);
    if (!backup) return null;
    const updated = { ...backup, restoreVerifiedAt: verifiedAt, updatedAt: new Date().toISOString() };
    this.backups.set(id, updated);
    return updated;
  }
}