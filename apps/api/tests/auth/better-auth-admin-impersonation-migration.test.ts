import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const v043 = readFileSync(
  new URL('../../src/read-models/sql/V043__better_auth_admin_impersonation.sql', import.meta.url),
  'utf8',
);

describe('V043 Better Auth admin + impersonation columns', () => {
  it('is applied on legacy VPS boot (present in the legacy manifest)', () => {
    const legacy = expectedMigrationManifest(true).map(({ version }) => version);
    expect(legacy).toContain(43);
  });

  it('is also present in the canonical manifest', () => {
    const canonical = expectedMigrationManifest(false).map(({ version }) => version);
    expect(canonical).toContain(43);
  });

  it('adds the admin-plugin session column with the exact quoted camelCase name', () => {
    expect(v043).toContain('ADD COLUMN IF NOT EXISTS "impersonatedBy"');
    expect(v043).toMatch(/ALTER TABLE session/i);
  });

  it('re-asserts every admin-plugin user column with the exact quoted camelCase names', () => {
    for (const column of ['"role"', '"banned"', '"banReason"', '"banExpires"']) {
      expect(v043).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(v043).toMatch(/ALTER TABLE "user"/i);
  });

  it('re-asserts the credential-provider account column missing on the VPS', () => {
    expect(v043).toContain('ADD COLUMN IF NOT EXISTS issuer');
    expect(v043).toMatch(/ALTER TABLE "?account"?/i);
  });

  it('is fully idempotent (no unguarded ADD COLUMN, no DROP)', () => {
    const sql = v043
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n');
    const adds = sql.match(/ADD COLUMN/gi) ?? [];
    const guarded = sql.match(/ADD COLUMN IF NOT EXISTS/gi) ?? [];
    expect(adds.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(adds.length);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it('documents the LEGACY_SAFE decision in its header', () => {
    expect(v043).toMatch(/LEGACY_SAFE/i);
  });
});
