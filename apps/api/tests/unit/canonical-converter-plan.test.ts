import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildConversionPlan,
  collectConversionPlan,
  LEGACY_EXPECTED_COLUMNS,
  type InventoriedRelation,
  type PlanEvidence,
  type StubPool,
} from '../../src/scripts/canonical-converter/plan.js';
import { planMigrations } from '../../src/read-models/sql/migrate.js';
import { buildCanonicalConversionPreflight } from '../../src/scripts/canonical-conversion-preflight.js';

const cleanPreflight = () =>
  buildCanonicalConversionPreflight({
    legacyAccounts: 0,
    orphanTransactions: 0,
    orphanCardPurchases: 0,
    duplicateCategories: 0,
    duplicateStatements: 0,
    usersMissingEmail: 0,
    membershipsUnresolved: 0,
    invitesUnresolved: 0,
    unlinkedStatementPayments: 0,
  });

const baseEvidence = (): PlanEvidence => ({
  relations: [
    { name: 'accounts', kind: 'table' },
    { name: 'transactions', kind: 'table' },
    { name: '_migrations', kind: 'table' },
  ],
  counts: { accounts: 2, transactions: 5, _migrations: 1 },
  legacyMigrationPlan: planMigrations([], []),
  canonicalMigrationPlan: planMigrations([], []),
  nonzeroInitialBalance: 0,
  missingLegacyColumns: [],
  missingCoreTables: [],
  preflight: cleanPreflight(),
  preflightUnavailable: [],
});

type Route = { match: (sql: string) => boolean; rows: Array<Record<string, unknown>> };

const stubPool = (routes: Route[]): StubPool => ({
  query: async (sql: string) => {
    const route = routes.find((r) => r.match(sql));
    const rows = route?.rows ?? [];
    return { rows, rowCount: rows.length };
  },
});

const includes =
  (...needles: string[]): Route['match'] =>
  (sql: string) =>
    needles.every((n) => sql.includes(n));

const legacyRelationsRows = (): Array<Record<string, unknown>> => [
  { name: 'accounts', kind: 'r' },
  { name: 'transactions', kind: 'r' },
  { name: '_migrations', kind: 'r' },
];

const realChecksumOf = (file: string): string => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'read-models', 'sql');
  return createHash('sha256').update(readFileSync(join(dir, file), 'utf8'), 'utf8').digest('hex');
};

const cleanStub = (): StubPool =>
  stubPool([
    // No extension-owned objects in the clean fixture (FINDING-3 probe).
    { match: includes('pg_depend'), rows: [] },
    { match: includes('pg_class'), rows: legacyRelationsRows() },
    { match: includes('initial_balance_cents'), rows: [{ count: 0 }] },
    {
      match: includes('information_schema.columns'),
      rows: LEGACY_EXPECTED_COLUMNS.map((c) => ({ table_name: c.table, column_name: c.column })),
    },
    { match: includes('COUNT(*'), rows: [{ count: 0 }] },
    {
      match: includes('_migrations'),
      rows: [{ version: 3, name: 'V003__legacy_safe_tables.sql', checksum: realChecksumOf('V003__legacy_safe_tables.sql') }],
    },
  ]);

describe('canonical converter plan (M1)', () => {
  it('reports ready when the legacy snapshot is clean', () => {
    const plan = buildConversionPlan(baseEvidence());
    expect(plan.ready).toBe(true);
    expect(plan.blockers).toEqual([]);
  });

  it('blocks on guarded-era migration drift', () => {
    const manifest = [{ version: 45, name: 'V045__category_tree_defaults.sql', checksum: 'real-checksum' }];
    const evidence = baseEvidence();
    evidence.canonicalMigrationPlan = planMigrations(manifest, [
      { version: 45, name: 'V045__category_tree_defaults.sql', checksum: 'tampered' },
    ]);
    const plan = buildConversionPlan(evidence);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'migration_drift', count: 1 }),
    );
  });

  it('blocks on pre-guard baseline drift instead of warning', () => {
    const manifest = [{ version: 8, name: 'V008__legacy_feature_tables.sql', checksum: 'real-checksum' }];
    const evidence = baseEvidence();
    evidence.legacyMigrationPlan = planMigrations(manifest, [
      { version: 8, name: 'V008__legacy_feature_tables.sql', checksum: 'edited-long-ago' },
    ]);
    const plan = buildConversionPlan(evidence);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'migration_baseline_drift', count: 1 }),
    );
  });

  it('blocks on unverifiable ledger rows needing checksum backfill', () => {
    const manifest = [{ version: 3, name: 'V003__legacy_safe_tables.sql', checksum: 'real-checksum' }];
    const evidence = baseEvidence();
    evidence.legacyMigrationPlan = planMigrations(manifest, [
      { version: 3, name: 'V003__legacy_safe_tables.sql', checksum: '' },
    ]);
    const plan = buildConversionPlan(evidence);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'migration_ledger_unverifiable', count: 1 }),
    );
  });

  it('blocks on orphan entities surfaced by the preflight', () => {
    const evidence = baseEvidence();
    evidence.preflight = buildCanonicalConversionPreflight({
      legacyAccounts: 0,
      orphanTransactions: 2,
      orphanCardPurchases: 1,
      duplicateCategories: 0,
      duplicateStatements: 0,
      usersMissingEmail: 0,
      membershipsUnresolved: 0,
      invitesUnresolved: 0,
      unlinkedStatementPayments: 0,
    });
    const plan = buildConversionPlan(evidence);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'orphan_transactions', count: 2 }),
    );
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'orphan_card_purchases', count: 1 }),
    );
  });

  it('reports nonzero initial balances as informational now that the V058 anchor backfills them', () => {
    const evidence = baseEvidence();
    evidence.nonzeroInitialBalance = 3;
    const plan = buildConversionPlan(evidence);
    expect(plan.ready).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(plan.informational).toContainEqual(
      expect.objectContaining({ code: 'nonzero_initial_balance', count: 3 }),
    );
  });

  it('blocks on fingerprint mismatch and missing core tables', () => {
    const evidence = baseEvidence();
    evidence.missingLegacyColumns = ['accounts.is_credit_card'];
    evidence.missingCoreTables = ['statements'];
    const plan = buildConversionPlan(evidence);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'legacy_fingerprint_mismatch', count: 1 }),
    );
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'missing_legacy_core_table', count: 1 }),
    );
  });

  it('blocks on relations outside the known inventory', () => {
    const relations: InventoriedRelation[] = [
      { name: 'accounts', kind: 'table' },
      { name: 'shadow_malicious', kind: 'table' },
    ];
    const plan = buildConversionPlan({ ...baseEvidence(), relations, knownRelations: ['accounts'] });
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'uninventoried_public_relation', count: 1 }),
    );
  });

  it('blocks when a preflight observation is unavailable', () => {
    const evidence = baseEvidence();
    evidence.preflightUnavailable = ['orphanTransactions'];
    const plan = buildConversionPlan(evidence);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'preflight_unavailable', count: 1 }),
    );
  });

  it('collects a deterministic plan over a stubbed pool', async () => {
    const first = await collectConversionPlan(cleanStub());
    const second = await collectConversionPlan(cleanStub());
    expect(first.ready).toBe(true);
    expect(first.blockers).toEqual([]);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(first)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
  });

  it('collects nonzero balances through the stubbed pool as informational', async () => {
    const pool = stubPool([
      { match: includes('pg_depend'), rows: [] },
      { match: includes('pg_class'), rows: legacyRelationsRows() },
      { match: includes('initial_balance_cents'), rows: [{ count: 4 }] },
      { match: includes('information_schema.columns'), rows: [] },
      { match: includes('COUNT(*'), rows: [{ count: 0 }] },
      { match: includes('_migrations'), rows: [] },
    ]);
    const plan = await collectConversionPlan(pool);
    expect(plan.ready).toBe(false);
    expect(plan.blockers).toContainEqual(
      expect.objectContaining({ code: 'legacy_fingerprint_mismatch' }),
    );
    expect(plan.blockers).not.toContainEqual(
      expect.objectContaining({ code: 'nonzero_initial_balance' }),
    );
    expect(plan.informational).toContainEqual(
      expect.objectContaining({ code: 'nonzero_initial_balance', count: 4 }),
    );
  });

  it('FINDING-3 RED: excludes extension-owned functions (pgcrypto) from the inventory', async () => {
    // A real legacy database carries pgcrypto (V001/V013/V053): its
    // functions (gen_random_uuid, digest, ...) live in public but belong to
    // the extension. They must not be inventoried as app functions —
    // `ALTER FUNCTION ... SET SCHEMA` refuses to move them and the
    // conversion would abort.
    const pool = stubPool([
      {
        match: (sql: string) => sql.includes('pg_depend') && sql.includes('pg_proc'),
        rows: [{ name: 'gen_random_uuid' }],
      },
      {
        match: (sql: string) => sql.includes('pg_depend'),
        rows: [],
      },
      { match: includes('pg_class'), rows: legacyRelationsRows() },
      {
        match: (sql: string) => sql.includes('pg_proc') && !sql.includes('pg_depend'),
        rows: [
          { name: 'gen_random_uuid', args: '' },
          { name: 'set_updated_at', args: '' },
        ],
      },
      { match: includes('initial_balance_cents'), rows: [{ count: 0 }] },
      {
        match: includes('information_schema.columns'),
        rows: LEGACY_EXPECTED_COLUMNS.map((c) => ({ table_name: c.table, column_name: c.column })),
      },
      { match: includes('COUNT(*'), rows: [{ count: 0 }] },
      {
        match: includes('_migrations'),
        rows: [{ version: 3, name: 'V003__legacy_safe_tables.sql', checksum: realChecksumOf('V003__legacy_safe_tables.sql') }],
      },
    ]);
    const { listRelations } = await import('../../src/scripts/canonical-converter/plan.js');
    const relations = await listRelations(pool, 'public');
    expect(relations.find((r) => r.name === 'gen_random_uuid')).toBeUndefined();
    expect(relations.find((r) => r.name === 'set_updated_at')).toBeDefined();
  });
});
