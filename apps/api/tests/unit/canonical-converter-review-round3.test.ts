import { describe, expect, it } from 'vitest';

/**
 * REVIEW ROUND 3 — RED suite (TDD: each test fails before its fix).
 *
 * F1 (dry-run sem marker planeja sobre estado parcial): `runCanonicalConversion`
 * com `dryRun: true` retorna após `collectPlanForSchema` ANTES da sonda
 * `detectMarkerlessPartialState` — o diagnóstico read-only de uma falha
 * pré-marker dá NO-GO genérico em vez de orientação RESTAURE. Cobertura
 * comportamental no integration
 * `postgres-canonical-converter-review-round3.test.ts` (F1); aqui ficam os
 * contratos unitários da regra compartilhada.
 *
 * F2 (inconsistência archive vazio): `convert.ts` tolera `legacy_archive`
 * VAZIO com public intacto (não-parcial), mas o bootstrap recusa QUALQUER
 * `legacy_archive` pré-existente. O predicado abaixo é a regra da sonda
 * extraída para o bootstrap — RED por ausência antes do fix.
 */

type Row = Record<string, unknown>;

type StubQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Row[]; rowCount: number }>;

const asPool = (query: StubQuery) => ({ query }) as never;

const stubArchive = ({ relations, functions, exists }: { relations: number; functions: number; exists: boolean }) =>
  asPool(async (sql: string) => {
    // NOTE: the count queries JOIN pg_namespace, so match them first.
    if (sql.includes('pg_proc')) return { rows: [{ n: functions }], rowCount: 1 };
    if (sql.includes('pg_class')) return { rows: [{ n: relations }], rowCount: 1 };
    if (sql.includes('pg_namespace')) return { rows: [{ exists }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });

describe('review round 3 — FINDING F2: empty archive is not partial state', () => {
  it('RED: exposes archiveHoldsObjects from archive-and-bootstrap', async () => {
    const mod = (await import(
      '../../src/scripts/canonical-converter/archive-and-bootstrap.js'
    )) as unknown as Record<string, unknown>;
    expect(typeof mod.archiveHoldsObjects).toBe('function');
  });

  it('RED: an existing but EMPTY archive holds no objects', async () => {
    const { archiveHoldsObjects } = (await import(
      '../../src/scripts/canonical-converter/archive-and-bootstrap.js'
    )) as unknown as {
      archiveHoldsObjects: (pool: never, archiveSchema: string) => Promise<boolean>;
    };
    await expect(archiveHoldsObjects(stubArchive({ relations: 0, functions: 0, exists: true }), 'legacy_archive')).resolves.toBe(
      false,
    );
  });

  it('RED: an archive with relations holds objects', async () => {
    const { archiveHoldsObjects } = (await import(
      '../../src/scripts/canonical-converter/archive-and-bootstrap.js'
    )) as unknown as {
      archiveHoldsObjects: (pool: never, archiveSchema: string) => Promise<boolean>;
    };
    await expect(archiveHoldsObjects(stubArchive({ relations: 3, functions: 0, exists: true }), 'legacy_archive')).resolves.toBe(
      true,
    );
  });

  it('RED: an archive with only functions holds objects', async () => {
    const { archiveHoldsObjects } = (await import(
      '../../src/scripts/canonical-converter/archive-and-bootstrap.js'
    )) as unknown as {
      archiveHoldsObjects: (pool: never, archiveSchema: string) => Promise<boolean>;
    };
    await expect(archiveHoldsObjects(stubArchive({ relations: 0, functions: 2, exists: true }), 'legacy_archive')).resolves.toBe(
      true,
    );
  });

  it('RED: an absent archive holds no objects', async () => {
    const { archiveHoldsObjects } = (await import(
      '../../src/scripts/canonical-converter/archive-and-bootstrap.js'
    )) as unknown as {
      archiveHoldsObjects: (pool: never, archiveSchema: string) => Promise<boolean>;
    };
    await expect(archiveHoldsObjects(stubArchive({ relations: 0, functions: 0, exists: false }), 'legacy_archive')).resolves.toBe(
      false,
    );
  });
});

describe('review round 3 — FINDING F1: dry-run shares the markerless rule', () => {
  it('RED: detectMarkerlessPartialState tolerates an EMPTY archive next to an intact public', async () => {
    const { detectMarkerlessPartialState } = (await import(
      '../../src/scripts/canonical-converter/convert.js'
    )) as unknown as {
      detectMarkerlessPartialState: (
        pool: never,
        schema: string,
        archiveSchema: string,
      ) => Promise<{ partial: boolean; reason: string }>;
    };
    const pool = {
      query: async (sql: string) => {
        if (sql.includes('pg_proc')) return { rows: [{ n: 0 }], rowCount: 1 };
        if (sql.includes('pg_class')) return { rows: [{ n: 0 }], rowCount: 1 };
        if (sql.includes('pg_namespace')) return { rows: [{ exists: true }], rowCount: 1 };
        if (sql.includes('information_schema')) {
          return {
            rows: [{ table_name: 'accounts' }, { table_name: 'transactions' }, { table_name: '_migrations' }],
            rowCount: 3,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as never;
    const result = await detectMarkerlessPartialState(pool, 'public', 'legacy_archive');
    expect(result.partial).toBe(false);
  });
});
