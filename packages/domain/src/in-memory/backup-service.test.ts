import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBackupRepository } from './backup-repository.js';
import { BackupService } from '../core/services/backup-service.js';

// Mock file system state
interface FileStore {
  files: Map<string, Buffer>;
  dirs: Set<string>;
}

describe('BackupService', () => {
  let repo: InMemoryBackupRepository;
  let execCalls: string[];

  const makeService = (store: FileStore) => new BackupService(repo, {
    execSync: (cmd: string) => { execCalls.push(cmd); },
    readFileSync: (path: string): Buffer => {
      const data = store.files.get(path);
      if (!data) throw new Error(`ENOENT: ${path}`);
      return data;
    },
    writeFileSync: (path: string, data: Buffer) => { store.files.set(path, data); },
    mkdirSync: (path: string) => { store.dirs.add(path); },
    existsSync: (path: string) => store.dirs.has(path) || store.files.has(path),
    unlinkSync: (path: string) => { store.files.delete(path); },
  });

  beforeEach(() => {
    repo = new InMemoryBackupRepository();
    execCalls = [];
  });

  describe('createBackup', () => {
    it('creates backup record with checksum from generated file', async () => {
      const store: FileStore = { files: new Map(), dirs: new Set(['data/backups']) };
      const service = makeService(store);

      // Simulate pg_dump writing a file
      service['deps'].execSync = (cmd: string) => {
        execCalls.push(cmd);
        // pg_dump would write the file — simulate it
        const match = cmd.match(/ -f "([^"]+)"/);
        if (match) {
          store.files.set(match[1], Buffer.from('CREATE TABLE test;'));
        }
      };

      const result = await service.createBackup({
        householdId: 'household-1',
        databaseUrl: 'postgresql://localhost/testdb',
        outputDir: 'data/backups',
      });

      expect(result.success).toBe(true);
      expect(result.backup).toBeDefined();
      expect(result.backup!.householdId).toBe('household-1');
      expect(result.backup!.checksum).toHaveLength(64); // SHA-256
      expect(result.backup!.sizeBytes).toBeGreaterThan(0);
      expect(result.backup!.restoreVerifiedAt).toBeNull();
    });

    it('fails when DATABASE_URL not configured', async () => {
      const store: FileStore = { files: new Map(), dirs: new Set() };
      const service = makeService(store);

      const result = await service.createBackup({
        householdId: 'household-1',
        outputDir: 'data/backups',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('DATABASE_URL');
    });
  });

  describe('verifyRestore', () => {
    it('marks restoreVerifiedAt when verification succeeds', async () => {
      const store: FileStore = { files: new Map(), dirs: new Set() };
      const service = makeService(store);

      // Create backup with known checksum (empty buffer)
      const emptyChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      await repo.create({
        id: 'backup-1',
        householdId: 'household-1',
        path: 'data/backups/dump.sql',
        checksum: emptyChecksum,
        sizeBytes: 0,
        restoreVerifiedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Simulate the file existing with matching checksum
      store.files.set('data/backups/dump.sql', Buffer.from(''));

      const result = await service.verifyRestore({
        backupId: 'backup-1',
        householdId: 'household-1',
        testDatabaseUrl: 'postgresql://localhost/testdb',
      });

      expect(result.success).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.backup!.restoreVerifiedAt).not.toBeNull();
    });

    it('fails when backup not found', async () => {
      const store: FileStore = { files: new Map(), dirs: new Set() };
      const service = makeService(store);

      const result = await service.verifyRestore({
        backupId: 'nonexistent',
        householdId: 'household-1',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('não encontrado');
    });

    it('fails when checksum does not match', async () => {
      const store: FileStore = { files: new Map(), dirs: new Set() };
      const service = makeService(store);

      await repo.create({
        id: 'backup-2',
        householdId: 'household-1',
        path: 'data/backups/dump.sql',
        checksum: 'wrongchecksumvalue123456789012345678901234567890123456789012',
        sizeBytes: 100,
        restoreVerifiedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // File exists but checksum doesn't match
      store.files.set('data/backups/dump.sql', Buffer.from('different content'));

      const result = await service.verifyRestore({
        backupId: 'backup-2',
        householdId: 'household-1',
        testDatabaseUrl: 'postgresql://localhost/testdb',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Checksum');
    });
  });

  describe('listByHousehold', () => {
    it('returns all backups for household', async () => {
      const store: FileStore = { files: new Map(), dirs: new Set() };
      const service = makeService(store);

      await repo.create({
        id: 'b1', householdId: 'h1', path: '/b1.sql',
        checksum: 'c1', sizeBytes: 100, restoreVerifiedAt: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repo.create({
        id: 'b2', householdId: 'h1', path: '/b2.sql',
        checksum: 'c2', sizeBytes: 200, restoreVerifiedAt: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      await repo.create({
        id: 'b3', householdId: 'h2', path: '/b3.sql',
        checksum: 'c3', sizeBytes: 300, restoreVerifiedAt: null,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });

      const list = await service.listByHousehold('h1');
      expect(list).toHaveLength(2);
      expect(list.map(b => b.id).sort()).toEqual(['b1', 'b2']);
    });

    it('returns empty for household with no backups', async () => {
      const store: FileStore = { files: new Map(), dirs: new Set() };
      const service = makeService(store);

      const list = await service.listByHousehold('nonexistent');
      expect(list).toHaveLength(0);
    });
  });
});