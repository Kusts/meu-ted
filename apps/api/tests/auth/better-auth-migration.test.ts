import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const migration = readFileSync(new URL('../../src/read-models/sql/V017__better_auth.sql', import.meta.url), 'utf8');
const normalizationMigration = readFileSync(new URL('../../src/read-models/sql/V018__invite_email_normalization.sql', import.meta.url), 'utf8');
const casingMigration = readFileSync(new URL('../../src/read-models/sql/V019__better_auth_casing.sql', import.meta.url), 'utf8');

describe('Better Auth persistence migration', () => {
  it('creates the native user, session, account and verification models additively', () => {
    for (const table of ['user', 'session', 'account', 'verification', 'memberships', 'invites']) {
      expect(migration).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS [\\\"]?${table}[\\\"]?`));
    }
    expect(migration).toContain('session_token_key');
    expect(migration).toContain('session_user_id_idx');
    expect(migration).toContain('account_user_id_idx');
    expect(migration).toContain('verification_identifier_idx');
    expect(migration).toContain('memberships_household_idx');
    expect(migration).toContain('invites_household_idx');
  });

  it('does not rename or remove the financial household identity', () => {
    expect(migration).not.toMatch(/DROP\s+TABLE|ALTER\s+TABLE\s+households\s+DROP/i);
    expect(migration).toContain('household_id');
  });

  it('adds normalized invite email identity without destructive changes', () => {
    expect(normalizationMigration).toContain('ADD COLUMN IF NOT EXISTS email_normalized TEXT');
    expect(normalizationMigration).toContain('lower(trim(email))');
    expect(normalizationMigration).toContain('email_normalized SET NOT NULL');
    expect(normalizationMigration).not.toMatch(/DROP\s+TABLE|DROP\s+COLUMN/i);
  });

  it('aligns Better Auth native columns with its Kysely adapter', () => {
    expect(casingMigration).toContain('email_verified TO "emailVerified"');
    expect(casingMigration).toContain('user_id TO "userId"');
    expect(casingMigration).toContain('user_agent TO "userAgent"');
    expect(casingMigration).toContain('expires_at TO "expiresAt"');
  });

  it('includes Better Auth and invite migrations in the canonical manifest', () => {
    expect(expectedMigrationManifest().map(({ version }) => version)).toEqual(expect.arrayContaining([17, 18, 19]));
  });
});
