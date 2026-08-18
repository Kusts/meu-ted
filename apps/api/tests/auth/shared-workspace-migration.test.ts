import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const migration = readFileSync(new URL('../../src/read-models/sql/V022__shared_workspace_invariants.sql', import.meta.url), 'utf8');

describe('shared workspace invariants', () => {
  it('requires an active owner and protects the last owner', () => {
    expect(migration).toMatch(/CREATE TABLE ownership_transfers/);
    expect(migration).toMatch(/last owner/i);
    expect(migration).toMatch(/FOR EACH ROW EXECUTE FUNCTION/);
  });

  it('keeps transfer pending until destination accepts', () => {
    expect(migration).toMatch(/status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'pending'/);
    expect(migration).toMatch(/status\s+(?:IN|<>)[\s\S]*'accepted'/);
    expect(migration).toMatch(/UPDATE memberships/);
  });

  it('is included in the migration manifest', () => {
    expect(expectedMigrationManifest(true).map(({ version }) => version)).toContain(22);
  });
});
