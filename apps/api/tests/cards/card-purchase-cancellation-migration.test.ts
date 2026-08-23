import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const MIGRATION_FILE_V033 = new URL('../../src/read-models/sql/V033__card_purchase_cancellation.sql', import.meta.url);

describe('card purchase cancellation migration (V033)', () => {
  it('migration file exists and is non-empty', () => {
    expect(existsSync(MIGRATION_FILE_V033)).toBe(true);
    const sql = readFileSync(MIGRATION_FILE_V033, 'utf8');
    expect(sql.length).toBeGreaterThan(0);
  });

  it('is included in both canonical and legacy migration manifests', () => {
    const canonicalVersions = expectedMigrationManifest(false).map(({ version }) => version);
    const legacyVersions = expectedMigrationManifest(true).map(({ version }) => version);

    expect(canonicalVersions).toContain(33);
    expect(legacyVersions).toContain(33);
  });

  it('contains additive columns, FK, and partial index without destructive deletes', () => {
    const sql = readFileSync(MIGRATION_FILE_V033, 'utf8');

    expect(sql).toMatch(/ALTER\s+TABLE\s+card_purchases\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+transaction_id\s+UUID/i);
    expect(sql).toMatch(/ALTER\s+TABLE\s+card_purchases\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+deleted_at/i);
    expect(sql).toMatch(/FOREIGN\s+KEY\s*\(\s*transaction_id\s*\)\s+REFERENCES\s+transactions\s*\(\s*id\s*\)/i);
    expect(sql).toMatch(/ON\s+DELETE\s+RESTRICT/i);
    expect(sql).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+card_purchases_active_statement_idx/i);
    expect(sql).toMatch(/WHERE\s+deleted_at\s+IS\s+NULL/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+card_purchases/i);
  });
});
