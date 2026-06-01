import type { Backup } from '../entities/backup.js';

export interface IBackupRepository {
  create(backup: Backup): Promise<Backup>;
  findById(id: string): Promise<Backup | null>;
  findByHouseholdId(householdId: string): Promise<Backup[]>;
  updateRestoreVerified(id: string, verifiedAt: string): Promise<Backup | null>;
}