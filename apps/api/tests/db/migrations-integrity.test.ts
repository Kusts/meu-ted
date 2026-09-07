import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expectedMigrationManifest } from '../../src/read-models/sql/migrate.js';

const v047 = readFileSync(new URL('../../src/read-models/sql/V047__statement_uniqueness.sql', import.meta.url), 'utf8');
const v048 = readFileSync(new URL('../../src/read-models/sql/V048__category_uniqueness.sql', import.meta.url), 'utf8');

describe('V047 statement uniqueness (H-04) + card metadata (M-04)', () => {
  it('is registered in canonical and legacy manifests', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(47);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).toContain(47);
  });

  it('dedupes statements deterministically before constraining', () => {
    expect(v047).toMatch(/SELECT DISTINCT ON \(household_id, account_id, cycle_year_month\)/);
    // Both link tables are re-pointed to the keeper before losers are deleted.
    expect(v047).toMatch(/UPDATE transactions[\s\S]*SET statement_id = k\.id/);
    expect(v047).toMatch(/UPDATE card_purchases[\s\S]*SET statement_id = k\.id/);
    expect(v047).toMatch(/DELETE FROM statements/);
  });

  it('adds the unique index backing INSERT ... ON CONFLICT DO NOTHING', () => {
    expect(v047).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS statements_household_account_cycle_uidx/);
    expect(v047).toMatch(/ON statements \(household_id, account_id, cycle_year_month\)/);
  });

  it('adds subcategory + notes columns to card_purchases', () => {
    expect(v047).toMatch(/ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS subcategory_id UUID/);
    expect(v047).toMatch(/ALTER TABLE card_purchases ADD COLUMN IF NOT EXISTS notes TEXT/);
  });
});

describe('V048 category uniqueness (M-02)', () => {
  it('is registered in the canonical manifest only (status-based predicate)', () => {
    expect(expectedMigrationManifest(false).map(({ version }) => version)).toContain(48);
    expect(expectedMigrationManifest(true).map(({ version }) => version)).not.toContain(48);
  });

  it('re-points referencing transactions before deactivating losers', () => {
    expect(v048).toMatch(/SET category_id = k\.id/);
    expect(v048).toMatch(/SET subcategory_id = k\.id/);
    expect(v048).toMatch(/SET status = 'inactive'/);
  });

  it('adds a partial functional unique index on the matching key', () => {
    expect(v048).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS categories_household_kind_parent_name_uidx/);
    expect(v048).toMatch(/COALESCE\(parent_id/);
    expect(v048).toMatch(/lower\(name\)/);
    expect(v048).toMatch(/WHERE status = 'active' AND deleted_at IS NULL/);
  });
});
