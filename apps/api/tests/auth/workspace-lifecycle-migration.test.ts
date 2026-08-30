import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const migrationUrl = new URL('../../src/read-models/sql/V036__workspace_lifecycle.sql', import.meta.url);

describe('workspace lifecycle migration', () => {
  it('adds an active/archived lifecycle without deleting financial data', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    const sql = readFileSync(migrationUrl, 'utf8');
    expect(sql).toContain('ALTER TABLE households');
    expect(sql).toContain('archived_at');
    expect(sql).toMatch(/status IN \('active', 'archived'\)/);
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
    expect(expectedMigrationManifest().map(({ version }) => version)).toContain(36);
  });
});
