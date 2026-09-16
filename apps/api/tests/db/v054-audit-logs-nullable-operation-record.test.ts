import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const v054 = readFileSync(
  new URL('../../src/read-models/sql/V054__audit_logs_nullable_operation_record.sql', import.meta.url),
  'utf8',
);

describe('V054 audit_logs nullable operation_record (FIX-F0, SPEC §24)', () => {
  it('is registered in the canonical and legacy manifests', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(54);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).toContain(54);
  });

  it('no longer reserves V053: the device-token migration landed (T2.4)', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(53);
  });

  it('drops NOT NULL on the real V013 column (operation_record_id), additively', () => {
    expect(v054).toMatch(/operation_record_id/);
    expect(v054).toMatch(/ALTER TABLE audit_logs ALTER COLUMN operation_record_id DROP NOT NULL/);
    expect(v054).not.toMatch(/DROP TABLE/);
    expect(v054).not.toMatch(/DROP COLUMN/);
  });

  it('is legacy-safe by guard (no-op where the canonical column is absent)', () => {
    expect(v054).toMatch(/IF EXISTS/);
    expect(v054).toMatch(/information_schema\.columns/);
    expect(v054).toMatch(/column_name = 'operation_record_id'/);
  });
});
