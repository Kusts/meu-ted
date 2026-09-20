import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const v055 = readFileSync(
  new URL('../../src/read-models/sql/V055__negative_bank_cash_balances.sql', import.meta.url),
  'utf8',
);

describe('V055 negative bank/cash balances', () => {
  it('is registered in the canonical and legacy manifests', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(55);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).toContain(55);
  });

  it('does not touch V001 and never drops tables or columns', () => {
    const v001 = readFileSync(
      new URL('../../src/read-models/sql/V001__init.sql', import.meta.url),
      'utf8',
    );
    expect(v001).toMatch(/CHECK \(balance_cents >= 0\)/);
    expect(v055).not.toMatch(/DROP TABLE/);
    expect(v055).not.toMatch(/DROP COLUMN/);
  });

  it('replaces the all-kind check with the credit-card-only conditional check', () => {
    expect(v055).toMatch(/DROP CONSTRAINT accounts_balance_cents_check/);
    expect(v055).toMatch(/accounts_balance_nonnegative_card_chk/);
    expect(v055).toMatch(/kind <> 'credit_card' OR balance_cents >= 0/);
  });

  it('is legacy-safe by guard (no-op where the canonical accounts shape is absent)', () => {
    expect(v055).toMatch(/IF EXISTS/);
    expect(v055).toMatch(/information_schema\.columns/);
    expect(v055).toMatch(/column_name = 'balance_cents'/);
    expect(v055).toMatch(/column_name = 'kind'/);
  });

  it('is idempotent on re-run (guarded ADD)', () => {
    expect(v055).toMatch(/IF NOT EXISTS/);
    expect(v055).toMatch(/pg_constraint/);
  });
});
