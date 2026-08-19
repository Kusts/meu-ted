import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

describe('approval persistence migration', () => {
  it('includes the pending-operation migration in the canonical manifest', () => {
    expect(expectedMigrationManifest().map(({ version }) => version)).toContain(23);
  });
});
