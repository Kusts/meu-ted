import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

describe('legacy approval persistence', () => {
  it('includes the pending-operation migration in the legacy manifest', () => {
    expect(expectedMigrationManifest(true).map(({ version }) => version)).toContain(23);
  });
});
