import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest, LEGACY_SAFE_PREFIXES } from '../../src/read-models/sql/migrate.js';

const v053 = readFileSync(
  new URL('../../src/read-models/sql/V053__device_token_hardening.sql', import.meta.url),
  'utf8',
);

describe('V053 device token hardening (SPEC §9, ADR-015 Opção C)', () => {
  it('is registered in the canonical and legacy manifests', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(53);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).toContain(53);
  });

  it('is listed as legacy-safe', () => {
    expect(LEGACY_SAFE_PREFIXES).toContain('V053');
  });

  it('adds the hardening columns additively', () => {
    for (const column of ['token_hash', 'user_id', 'name', 'last_used_at', 'expires_at', 'legacy']) {
      expect(v053).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`, 'i'));
    }
    expect(v053).not.toMatch(/DROP TABLE/);
    expect(v053).not.toMatch(/DROP COLUMN/);
  });

  it('backfills legacy rows with SHA-256 in SQL and a coexistence window', () => {
    expect(v053).toMatch(/sha256|digest\(/i);
    expect(v053).toMatch(/legacy\s*=\s*TRUE/i);
    expect(v053).toMatch(/INTERVAL '90 days'/);
  });

  it('is legacy-safe by guard (no-op where device_tokens is absent)', () => {
    expect(v053).toMatch(/IF EXISTS/);
    expect(v053).toMatch(/information_schema\.(columns|tables)/);
  });
});
