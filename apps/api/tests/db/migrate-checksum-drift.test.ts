import { describe, expect, it } from 'vitest';
import {
  expectedMigrationManifest,
  planMigrations,
  runMigrations,
} from '../../src/read-models/sql/migrate.js';

const manifest = [
  { version: 1, name: 'V001__init.sql', checksum: 'aaa' },
  { version: 2, name: 'V002__add.sql', checksum: 'bbb' },
  { version: 3, name: 'V003__more.sql', checksum: 'ccc' },
];

describe('M-06: migration drift detection', () => {
  it('sem drift quando aplicado == manifesto', () => {
    const plan = planMigrations(manifest, manifest.map((m) => ({ ...m })));
    expect(plan.drift).toEqual([]);
    expect(plan.backfill).toEqual([]);
    expect(plan.pending).toEqual([]);
  });

  it('detecta checksum alterado após aplicação', () => {
    const plan = planMigrations(manifest, [
      { version: 1, name: 'V001__init.sql', checksum: 'aaa' },
      { version: 2, name: 'V002__add.sql', checksum: 'TAMPERED' },
      { version: 3, name: 'V003__more.sql', checksum: 'ccc' },
    ]);
    expect(plan.drift).toHaveLength(1);
    expect(plan.drift[0]).toMatchObject({ version: 2, kind: 'checksum' });
  });

  it('detecta arquivo renomeado para a mesma versão', () => {
    const plan = planMigrations(manifest, [
      { version: 1, name: 'V001__init.sql', checksum: 'aaa' },
      { version: 2, name: 'V002__renamed.sql', checksum: 'bbb' },
      { version: 3, name: 'V003__more.sql', checksum: 'ccc' },
    ]);
    expect(plan.drift).toHaveLength(1);
    expect(plan.drift[0]).toMatchObject({ version: 2, kind: 'name' });
  });

  it('versão aplicada fora do manifesto não é drift (tolerância a downgrade)', () => {
    const plan = planMigrations(manifest.slice(0, 2), [
      { version: 1, name: 'V001__init.sql', checksum: 'aaa' },
      { version: 2, name: 'V002__add.sql', checksum: 'bbb' },
      { version: 99, name: 'V099__future.sql', checksum: 'zzz' },
    ]);
    expect(plan.drift).toEqual([]);
  });

  it("checksum vazio (linha pré-checksum) vai para backfill, não drift", () => {
    const plan = planMigrations(manifest, [
      { version: 1, name: 'V001__init.sql', checksum: '' },
      { version: 2, name: 'V002__add.sql', checksum: 'bbb' },
      { version: 3, name: 'V003__more.sql', checksum: 'ccc' },
    ]);
    expect(plan.drift).toEqual([]);
    expect(plan.backfill).toEqual([{ version: 1, checksum: 'aaa' }]);
  });

  it('pendentes são as versões do manifesto ainda não aplicadas', () => {
    const plan = planMigrations(manifest, [{ version: 1, name: 'V001__init.sql', checksum: 'aaa' }]);
    expect(plan.pending.map((p) => p.version)).toEqual([2, 3]);
  });
});

const fakePool = (rows: Array<{ version: number; name: string; checksum: string }>) => {
  const queries: string[] = [];
  return {
    queries,
    pool: {
      query: async (text: string, values?: unknown[]) => {
        queries.push(text);
        if (/FROM _migrations/.test(text)) return { rows: rows.map((r) => ({ ...r })), rowCount: rows.length };
        if (/UPDATE _migrations SET checksum/.test(text)) {
          const [checksum, version] = values as [string, number];
          const row = rows.find((r) => r.version === version);
          if (row) row.checksum = checksum;
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      },
      connect: async () => {
        throw new Error('no pending migrations expected in drift tests');
      },
    },
  };
};

describe('M-06: runMigrations aborta em drift (pool falso)', () => {
  it('manifesto real íntegro: nada a aplicar', async () => {
    const real = expectedMigrationManifest(false);
    const { pool } = fakePool(real.map((m) => ({ ...m })));
    await expect(runMigrations(pool as never, false)).resolves.toEqual({ applied: [] });
  });

  it('checksum adulterado: rejeita com diagnóstico explícito antes de aplicar', async () => {
    const real = expectedMigrationManifest(false);
    const rows = real.map((m) => ({ ...m }));
    rows[0]!.checksum = 'tampered-checksum';
    const { pool, queries } = fakePool(rows);
    await expect(runMigrations(pool as never, false)).rejects.toThrow(/migration drift detected/);
    expect(queries.some((q) => /INSERT INTO _migrations/.test(q))).toBe(false);
  });

  it("checksum vazio: preenche baseline e segue", async () => {
    const real = expectedMigrationManifest(false);
    const rows = real.map((m) => ({ ...m, checksum: '' }));
    const { pool, queries } = fakePool(rows);
    await expect(runMigrations(pool as never, false)).resolves.toEqual({ applied: [] });
    expect(queries.some((q) => /UPDATE _migrations SET checksum/.test(q))).toBe(true);
    expect(rows.every((r) => r.checksum.length > 0)).toBe(true);
  });
});
