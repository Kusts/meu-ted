import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const MIGRATION_FILE_V032 = new URL('../../src/read-models/sql/V032__legacy_card_purchases_household_id.sql', import.meta.url);

describe('legacy card purchases & accounts migration (V032)', () => {
  it('migration file exists and is non-empty', () => {
    expect(existsSync(MIGRATION_FILE_V032)).toBe(true);
    const sql = readFileSync(MIGRATION_FILE_V032, 'utf8');
    expect(sql.length).toBeGreaterThan(0);
  });

  it('is included in both canonical and legacy migration manifests', () => {
    const canonicalVersions = expectedMigrationManifest(false).map(({ version }) => version);
    const legacyVersions = expectedMigrationManifest(true).map(({ version }) => version);

    expect(canonicalVersions).toContain(32);
    expect(legacyVersions).toContain(32);
  });

  it('contains additive columns, statement backfill and orphan safety', () => {
    const sql = readFileSync(MIGRATION_FILE_V032, 'utf8');

    // Additive columns on card_purchases
    expect(sql).toMatch(/ALTER\s+TABLE\s+card_purchases\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+household_id\s+UUID/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+card_purchases\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+updated_at/i);

    // Additive columns on accounts
    expect(sql).toMatch(/ALTER\s+TABLE\s+accounts\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+updated_at/i);

    // Backfill via statements
    expect(sql).toMatch(/UPDATE\s+card_purchases\s+.*FROM\s+statements/is);
    expect(sql).toContain('cp.statement_id = s.id');

    // Non-destructive: must NEVER delete data from card_purchases
    expect(sql).not.toMatch(/DELETE\s+FROM\s+card_purchases/i);

    // Fail-safe orphan detection with RAISE EXCEPTION to abort/rollback safely
    expect(sql).toMatch(/DO\s+\$\$/i);
    expect(sql).toMatch(/IF\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+card_purchases\s+WHERE\s+household_id\s+IS\s+NULL\s*\)\s+THEN/i);
    expect(sql).toMatch(/RAISE\s+EXCEPTION/i);

    // Safe index creation
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i);
  });
});
