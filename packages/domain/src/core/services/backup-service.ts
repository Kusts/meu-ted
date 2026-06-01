// ─────────────────────────────────────────────────────────────────────────────
// Backup Service - DB backup with verify restore (REQ-038)
// ─────────────────────────────────────────────────────────────────────────────

import type { IBackupRepository } from '../repositories/backup-repository.js';
import type { Backup } from '../entities/backup.js';

export interface CreateBackupParams {
  householdId: string;
  databaseUrl?: string;
  outputDir?: string;
}

export interface VerifyRestoreParams {
  backupId: string;
  householdId: string;
  testDatabaseUrl?: string;
}

export interface BackupResult {
  success: boolean;
  backup?: Backup;
  verified?: boolean;
  reason?: string;
}

export class BackupService {
  constructor(
    private backupRepository: IBackupRepository,
    private deps: {
      execSync: (cmd: string) => void;
      readFileSync: (path: string) => Buffer;
      writeFileSync: (path: string, data: Buffer) => void;
      mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
      existsSync: (path: string) => boolean;
      unlinkSync: (path: string) => void;
    }
  ) {}

  /**
   * Create a database backup (pg_dump) — mocks execSync in tests
   */
  async createBackup(params: CreateBackupParams): Promise<BackupResult> {
    try {
      const householdId = params.householdId;
      const outputDir = params.outputDir ?? 'data/backups';
      const databaseUrl = params.databaseUrl ?? process.env['DATABASE_URL'] ?? '';

      if (!databaseUrl) {
        return { success: false, reason: 'DATABASE_URL não configurado' };
      }

      // Ensure output dir exists
      if (!this.deps.existsSync(outputDir)) {
        this.deps.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `backup-${householdId}-${timestamp}.sql`;
      const filePath = `${outputDir}/${filename}`;

      // Build pg_dump command
      const cmd = `pg_dump "${databaseUrl}" -f "${filePath}"`;

      // Execute pg_dump (mocked in tests)
      this.deps.execSync(cmd);

      // Calculate SHA-256 checksum
      const fileData = this.deps.readFileSync(filePath);
      const checksum = await this.calculateChecksum(fileData);

      // Get file size
      const sizeBytes = fileData.length;

      const backup: Backup = {
        id: crypto.randomUUID(),
        householdId,
        path: filePath,
        checksum,
        sizeBytes,
        restoreVerifiedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await this.backupRepository.create(backup);

      return { success: true, backup };
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }

  /**
   * Verify a backup by restoring to a test database — mocks in tests
   */
  async verifyRestore(params: VerifyRestoreParams): Promise<BackupResult> {
    try {
      const backup = await this.backupRepository.findById(params.backupId);
      if (!backup) {
        return { success: false, reason: 'Backup não encontrado' };
      }

      if (backup.householdId !== params.householdId) {
        return { success: false, reason: 'Backup não pertence a este household' };
      }

      if (!this.deps.existsSync(backup.path)) {
        return { success: false, reason: 'Arquivo de backup não encontrado' };
      }

      const testDatabaseUrl = params.testDatabaseUrl ?? process.env['TEST_DATABASE_URL'] ?? '';
      if (!testDatabaseUrl) {
        return { success: false, reason: 'TEST_DATABASE_URL não configurado' };
      }

      // Verify checksum first
      const fileData = this.deps.readFileSync(backup.path);
      const checksum = await this.calculateChecksum(fileData);

      if (checksum !== backup.checksum) {
        return { success: false, verified: false, reason: 'Checksum não confere — backup corrompido' };
      }

      // Restore to test database (mocked in tests)
      const dropCmd = `psql "${testDatabaseUrl}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`;
      const restoreCmd = `psql "${testDatabaseUrl}" -f "${backup.path}"`;

      this.deps.execSync(dropCmd);
      this.deps.execSync(restoreCmd);

      // Update restore verified timestamp
      const verifiedAt = new Date().toISOString();
      const updated = await this.backupRepository.updateRestoreVerified(params.backupId, verifiedAt);

      return { success: true, verified: true, backup: updated ?? undefined };
    } catch (err) {
      return { success: false, verified: false, reason: err instanceof Error ? err.message : 'Erro desconhecido' };
    }
  }

  /**
   * List backups by household
   */
  async listByHousehold(householdId: string): Promise<Backup[]> {
    return this.backupRepository.findByHouseholdId(householdId);
  }

  /**
   * Calculate SHA-256 checksum of data
   */
  private async calculateChecksum(data: Buffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}