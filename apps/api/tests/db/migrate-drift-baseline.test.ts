import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIGRATION_DRIFT_BASELINE_VERSION,
  expectedMigrationManifest,
  normalizeStoredChecksum,
  planMigrations,
  runMigrations,
} from '../../src/read-models/sql/migrate.js';

expect(MIGRATION_DRIFT_BASELINE_VERSION).toBe(44);

/**
 * Deploy blocker: VPS boot refused on pre-guard production history.
 * Applied/manifest pairs below are the exact values from the production
 * drift log (truncated with `...` where the log truncated them — the
 * mismatch direction is what the test pins, not the full digests).
 */
const INCIDENT_PRE_GUARD_ROWS = [
  { version: 3, name: 'V003__x.sql', applied: '9894f3cb...', manifest: 'f1835c14...' },
  { version: 8, name: 'V008__x.sql', applied: '44227298', manifest: '6f2ba2d0' },
  { version: 9, name: 'V009__x.sql', applied: 'e0a95a1c', manifest: '8c584b2b' },
  { version: 10, name: 'V010__x.sql', applied: 'a75a828f', manifest: 'ab9beeb2' },
  { version: 11, name: 'V011__x.sql', applied: '55aa1580', manifest: 'e7990051' },
  { version: 12, name: 'V012__x.sql', applied: '28ddf985', manifest: 'b855acf0' },
  { version: 40, name: 'V040__x.sql', applied: '\\xd2b80907ab55...', manifest: 'a73c4549...' },
];

const incidentManifest = INCIDENT_PRE_GUARD_ROWS.map(({ version, name, manifest }) => ({
  version,
  name,
  checksum: manifest,
}));
const incidentApplied = INCIDENT_PRE_GUARD_ROWS.map(({ version, name, applied }) => ({
  version,
  name,
  checksum: applied,
}));

describe('drift baseline: bytea normalization', () => {
  it('bytea artifact decoding to the manifest is not drift (V041 incident class)', () => {
    // Production logged applied=`\x64e9882d709e...` against manifest
    // `64e9882d709e...` (truncated in the log): identical content, legacy
    // BYTEA storage. Full-length hex below stands in for the digests.
    const manifest = [{ version: 41, name: 'V041__x.sql', checksum: '64e9882d709e12ab34cd' }];
    const plan = planMigrations(manifest, [
      { version: 41, name: 'V041__x.sql', checksum: '\\x64e9882d709e12ab34cd' },
    ]);
    expect(plan.drift).toEqual([]);
    expect(plan.baselineDrift).toEqual([]);
  });

  it('bytea artifact that still differs is pre-guard baseline drift (V040 incident pair)', () => {
    const plan = planMigrations(incidentManifest, incidentApplied);
    expect(plan.drift).toEqual([]);
    expect(plan.baselineDrift.map((d) => d.version).sort((a, b) => a - b)).toEqual([3, 8, 9, 10, 11, 12, 40]);
    expect(plan.baselineDrift.every((d) => d.kind === 'checksum')).toBe(true);
  });

  it('normalizeStoredChecksum only strips valid even-length hex bytea', () => {
    expect(normalizeStoredChecksum('\\xABCDEF12')).toBe('abcdef12');
    expect(normalizeStoredChecksum('abcdef12')).toBe('abcdef12');
    expect(normalizeStoredChecksum('\\xnothex!!')).toBe('\\xnothex!!');
    expect(normalizeStoredChecksum('\\xabc')).toBe('\\xabc');
    expect(normalizeStoredChecksum('')).toBe('');
  });
});

describe('drift baseline: era policy', () => {
  const manifest = [
    { version: 44, name: 'V044__a.sql', checksum: 'aaa' },
    { version: 45, name: 'V045__b.sql', checksum: 'bbb' },
  ];

  it('real drift below the baseline warns instead of refusing (manifest covers it)', () => {
    const plan = planMigrations(
      [...manifest, { version: 8, name: 'V008__x.sql', checksum: 'canonical-008' }],
      [
        { version: 8, name: 'V008__x.sql', checksum: 'production-edit' },
        { version: 44, name: 'V044__a.sql', checksum: 'aaa' },
        { version: 45, name: 'V045__b.sql', checksum: 'bbb' },
      ],
    );
    expect(plan.drift).toEqual([]);
    expect(plan.baselineDrift).toMatchObject([{ version: 8, kind: 'checksum' }]);
  });

  it('real drift at/above the baseline stays fail-closed', () => {
    const plan = planMigrations(manifest, [
      { version: 44, name: 'V044__a.sql', checksum: 'aaa' },
      { version: 45, name: 'V045__b.sql', checksum: 'tampered' },
    ]);
    expect(plan.drift).toMatchObject([{ version: 45, kind: 'checksum' }]);
    expect(plan.baselineDrift).toEqual([]);
  });

  it('renamed file stays fail-closed in any era', () => {
    const plan = planMigrations(
      [{ version: 8, name: 'V008__x.sql', checksum: 'canonical-008' }],
      [{ version: 8, name: 'V008__renamed.sql', checksum: 'canonical-008' }],
    );
    expect(plan.drift).toMatchObject([{ version: 8, kind: 'name' }]);
    expect(plan.baselineDrift).toEqual([]);
  });
});

const fakePool = (rows: Array<{ version: number; name: string; checksum: string }>) => {
  const queries: string[] = [];
  return {
    queries,
    pool: {
      query: async (text: string) => {
        queries.push(text);
        if (/FROM _migrations/.test(text)) return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
        return { rows: [], rowCount: 0 };
      },
      connect: async () => {
        throw new Error('no pending migrations expected in baseline tests');
      },
    },
  };
};

describe('drift baseline: runMigrations behavior (pool falso, manifesto real)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pre-guard drift resolves with a structured WARN and applies nothing new', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const real = expectedMigrationManifest(false);
    const rows = real.map((m) => ({ ...m }));
    const v008 = rows.find((r) => r.name.startsWith('V008'));
    expect(v008).toBeDefined();
    v008!.checksum = 'production-edit';
    const { pool, queries } = fakePool(rows);
    await expect(runMigrations(pool as never, false)).resolves.toEqual({ applied: [] });
    expect(queries.some((q) => /INSERT INTO _migrations/.test(q))).toBe(false);
    const warnings = warn.mock.calls.map((call) => String(call[0]));
    const baseline = warnings.filter((line) => line.includes('migration.baseline_drift'));
    expect(baseline).toHaveLength(1);
    expect(baseline[0]).toContain('"version":8');
  });

  it('guarded-era drift still refuses boot before applying anything', async () => {
    const real = expectedMigrationManifest(false);
    const rows = real.map((m) => ({ ...m }));
    const v045 = rows.find((r) => r.name.startsWith('V045'));
    expect(v045).toBeDefined();
    v045!.checksum = 'tampered-checksum';
    const { pool, queries } = fakePool(rows);
    await expect(runMigrations(pool as never, false)).rejects.toThrow(/migration drift detected/);
    await expect(runMigrations(pool as never, false)).rejects.toThrow(/V045/);
    expect(queries.some((q) => /INSERT INTO _migrations/.test(q))).toBe(false);
  });
});
