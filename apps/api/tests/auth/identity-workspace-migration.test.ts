import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const migration = readFileSync(new URL('../../src/read-models/sql/V020__identity_workspaces.sql', import.meta.url), 'utf8');

describe('identity and household workspace migration', () => {
  it('creates identity tables and constrains household kind', () => {
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS users/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS households/);
    expect(migration).toMatch(/CREATE TABLE memberships_v020/);
    expect(migration).toMatch(/ALTER TABLE memberships_v020 RENAME TO memberships/);
    expect(migration).toMatch(/CREATE TABLE invites_v020/);
    expect(migration).toMatch(/ALTER TABLE invites_v020 RENAME TO invites/);
    expect(migration).toMatch(/kind\s+TEXT\s+NOT NULL/);
    expect(migration).toContain("UPDATE households SET kind = 'shared' WHERE kind IS NULL");
    expect(migration).toMatch(/CHECK\s*\(kind\s+IN\s*\('personal',\s*'shared'\)\)/);
  });

  it('is included in the canonical migration manifest', () => {
    expect(expectedMigrationManifest().map(({ version }) => version)).toContain(20);
  });
});
