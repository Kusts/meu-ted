import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const migration = readFileSync(new URL('../../src/read-models/sql/V021__personal_workspace_invariants.sql', import.meta.url), 'utf8');

describe('personal workspace invariants', () => {
  it('binds one personal workspace to one user', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS owner_user_id UUID/);
    expect(migration).toMatch(/ALTER TABLE memberships[\s\S]*ADD COLUMN IF NOT EXISTS kind TEXT/i);
    expect(migration).toMatch(/UNIQUE INDEX [\s\S]*personal[\s\S]*memberships[\s\S]*user_id/i);
    expect(migration).toMatch(/WHERE kind = 'personal'/);
  });

  it('blocks personal workspace invites and conversion to shared', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION .*personal.*invite/i);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION .*personal.*kind/i);
    expect(migration).toMatch(/RAISE EXCEPTION/);
  });

  it('is included in the migration manifest', () => {
    expect(expectedMigrationManifest(true).map(({ version }) => version)).toContain(21);
  });
});
