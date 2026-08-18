import { describe, expect, it } from 'vitest';
import { isBackupGateSatisfied } from '../../src/scripts/migration-job-policy.js';
import { migrationChecksum } from '../../src/read-models/sql/migrate.js';

describe('G0.4.6 — explicit migration job gates', () => {
  it('requires explicit backup confirmation and backup id', () => {
    expect(isBackupGateSatisfied({})).toBe(false);
    expect(isBackupGateSatisfied({ BACKUP_CONFIRMED: 'true' })).toBe(false);
    expect(isBackupGateSatisfied({ BACKUP_ID: 'backup-1' })).toBe(false);
    expect(isBackupGateSatisfied({ BACKUP_CONFIRMED: 'true', BACKUP_ID: 'backup-1' })).toBe(true);
  });

  it('produces a stable SHA-256 migration checksum', () => {
    const checksum = migrationChecksum('CREATE TABLE example (id UUID);');
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(migrationChecksum('CREATE TABLE example (id UUID);')).toBe(checksum);
    expect(migrationChecksum('CREATE TABLE example (id TEXT);')).not.toBe(checksum);
  });
});
