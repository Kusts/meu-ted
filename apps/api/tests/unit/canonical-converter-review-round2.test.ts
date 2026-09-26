import { describe, expect, it } from 'vitest';
import { BalanceError, resolveStatementLinks } from '../../src/scripts/canonical-converter/balances.js';

type Row = Record<string, unknown>;

type StubQuery = (sql: string, params?: unknown[]) => Promise<{ rows: Row[]; rowCount: number }>;

const asPool = (query: StubQuery) => ({ query }) as never;

/**
 * REVIEW ROUND 2 — RED suite (TDD: each test fails before its fix).
 *
 * H:  archive WITHOUT card_purchases but WITH a flagged transaction must
 *     fail closed (today it early-returns and the purchase is debited as a
 *     plain expense).
 * M1: a pre-existing DIVERGENT statement_id (canonical transaction already
 *     linked elsewhere than its card_purchases row) must fail closed
 *     (today the backfill only fills NULLs and converts silently).
 * M2: extension filtering by NAME drops an app function homonym
 *     (pgcrypto `digest` vs app `digest(text)`); filtering must use OID
 *     identity (today the app function vanishes from the inventory).
 * M3: a markerless partial state (failed bootstrap before the marker write)
 *     must refuse with a RESTORE orientation, not a generic NO-GO
 *     (`detectMarkerlessPartialState` does not exist yet — RED by absence).
 */

describe('review round 2 — FINDING H: missing card_purchases with flagged transaction', () => {
  const stubH = (): ReturnType<typeof asPool> & { query: StubQuery } => {
    const query: StubQuery = async (sql: string, params?: unknown[]) => {
      if (sql.includes('information_schema.tables')) {
        // The archive carries NO card_purchases table; everything else exists.
        const table = params?.[1];
        const schema = params?.[0];
        if (schema === 'legacy_archive' && table === 'card_purchases') {
          return { rows: [{ ok: false }], rowCount: 1 };
        }
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (sql.includes('information_schema.columns')) {
        // The legacy flag column IS present.
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (sql.includes('is_credit_card_purchase')) {
        return { rows: [{ id: 'tx-9' }], rowCount: 1 };
      }
      if (sql.includes('transactions')) {
        return { rows: [{ id: 'tx-9' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    return asPool(query) as ReturnType<typeof asPool> & { query: StubQuery };
  };

  it('RED: fails closed naming the missing card_purchases table instead of debiting as plain expense', async () => {
    const pool = stubH();
    await expect(resolveStatementLinks(pool, { schema: 'public' })).rejects.toThrow(
      /card_purchases.*missing|missing.*card_purchases/i,
    );
  });

  it('tolerance kept: no flagged rows and no card_purchases table resolves quietly', async () => {
    const query: StubQuery = async (sql: string, params?: unknown[]) => {
      if (sql.includes('information_schema.tables')) {
        const table = params?.[1];
        const schema = params?.[0];
        if (schema === 'legacy_archive' && table === 'card_purchases') {
          return { rows: [{ ok: false }], rowCount: 1 };
        }
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    };
    await expect(resolveStatementLinks(asPool(query), { schema: 'public' })).resolves.toEqual({
      backfilled: 0,
      checked: 0,
    });
  });
});

describe('review round 2 — FINDING M1: divergent pre-existing statement link', () => {
  const stubM1 = (): ReturnType<typeof asPool> => {
    const query: StubQuery = async (sql: string, params?: unknown[]) => {
      if (sql.includes('information_schema.tables')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (sql.includes('information_schema.columns')) {
        // No legacy flag column: the flagged check is skipped by tolerance.
        return { rows: [{ ok: false }], rowCount: 1 };
      }
      // The NEW divergent-link probe (absent in the pre-fix code).
      if (sql.includes('card_purchases') && sql.includes('t.statement_id IS NOT NULL')) {
        if (sql.includes('COUNT(*)')) {
          return { rows: [{ n: 1 }], rowCount: 1 };
        }
        return {
          rows: [{ id: 'tx-2', current_statement_id: 'st-2', linked_statement_id: 'st-1' }],
          rowCount: 1,
        };
      }
      if (sql.includes('transaction_id')) {
        return {
          rows: [
            { transaction_id: 'tx-1', statement_id: 'st-1', household_id: 'hh-1' },
            { transaction_id: 'tx-2', statement_id: 'st-1', household_id: 'hh-1' },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('FROM') && sql.includes('transactions')) {
        return { rows: [{ id: 'tx-1' }, { id: 'tx-2' }], rowCount: 2 };
      }
      if (sql.includes('statements')) {
        return { rows: [{ id: 'st-1' }, { id: 'st-2' }], rowCount: 2 };
      }
      if (sql.includes('UPDATE')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    };
    return asPool(query);
  };

  it('RED: fails closed listing the divergent link instead of converting silently', async () => {
    await expect(resolveStatementLinks(stubM1(), { schema: 'public' })).rejects.toThrow(/divergent/i);
  });

  it('RED: the error names the offending transaction', async () => {
    const failure = await resolveStatementLinks(stubM1(), { schema: 'public' }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(BalanceError);
    expect((failure as Error).message).toMatch(/tx-2/);
  });
});

describe('review round 2 — FINDING M2: extension filter must use OID identity, not names', () => {
  // pgcrypto owns digest(text,text) as OID 101; the app owns a homonym
  // digest(text) as OID 202 (same name, distinct signature — PG forbids an
  // identical name+argtypes pair, so the truly-distinct homonym is /1).
  const EXT_DIGEST_OID = '101';
  const APP_DIGEST_OID = '202';

  const stubM2 = () => ({
    query: async (sql: string) => {
      if (sql.includes('pg_depend') && sql.includes('pg_proc')) {
        return { rows: [{ oid: EXT_DIGEST_OID }], rowCount: 1 };
      }
      if (sql.includes('pg_depend')) {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes('pg_proc') && !sql.includes('pg_depend')) {
        return {
          rows: [
            { oid: EXT_DIGEST_OID, name: 'digest', args: 'text, text' },
            { oid: APP_DIGEST_OID, name: 'digest', args: 'text' },
          ],
          rowCount: 2,
        };
      }
      if (sql.includes('pg_class')) {
        return { rows: [{ oid: '201', name: 'accounts', kind: 'r' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  });

  it('RED: the app homonym digest(text) is inventoried while the extension digest(text,text) is excluded', async () => {
    const { listRelations } = await import('../../src/scripts/canonical-converter/plan.js');
    const relations = await listRelations(stubM2() as never, 'public');
    const digests = relations.filter((r) => r.name === 'digest' && r.kind === 'function');
    expect(digests).toHaveLength(1);
    expect(digests[0]).toMatchObject({ name: 'digest', identityArguments: 'text' });
  });
});

describe('review round 2 — FINDING M3: markerless partial state orients to RESTORE', () => {
  it('RED: exposes detectMarkerlessPartialState', async () => {
    const mod = (await import(
      '../../src/scripts/canonical-converter/convert.js'
    )) as unknown as Record<string, unknown>;
    expect(typeof mod.detectMarkerlessPartialState).toBe('function');
  });

  it('RED: reports partial when legacy_archive holds relations without a marker', async () => {
    const mod = (await import(
      '../../src/scripts/canonical-converter/convert.js'
    )) as unknown as {
      detectMarkerlessPartialState?: (
        pool: never,
        schema: string,
        archiveSchema: string,
      ) => Promise<{ partial: boolean; reason: string }>;
    };
    expect(typeof mod.detectMarkerlessPartialState).toBe('function');
    const detect = mod.detectMarkerlessPartialState!;
    const pool = {
      query: async (sql: string) => {
        // NOTE: the count queries JOIN pg_namespace, so match them first.
        if (sql.includes('pg_proc')) return { rows: [{ n: 0 }], rowCount: 1 };
        if (sql.includes('pg_class')) return { rows: [{ n: 3 }], rowCount: 1 };
        if (sql.includes('pg_namespace')) return { rows: [{ exists: true }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    } as never;
    const result = await detect(pool, 'public', 'legacy_archive');
    expect(result.partial).toBe(true);
    expect(result.reason).toMatch(/legacy_archive/i);
  });

  it('RED: reports clean when public is intact and the archive is absent', async () => {
    const mod = (await import(
      '../../src/scripts/canonical-converter/convert.js'
    )) as unknown as {
      detectMarkerlessPartialState?: (
        pool: never,
        schema: string,
        archiveSchema: string,
      ) => Promise<{ partial: boolean; reason: string }>;
    };
    const detect = mod.detectMarkerlessPartialState!;
    const pool = {
      query: async (sql: string) => {
        if (sql.includes('pg_namespace')) return { rows: [{ exists: false }], rowCount: 1 };
        if (sql.includes('information_schema')) {
          return {
            rows: [{ table_name: 'accounts' }, { table_name: 'transactions' }, { table_name: '_migrations' }],
            rowCount: 3,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    } as never;
    const result = await detect(pool, 'public', 'legacy_archive');
    expect(result.partial).toBe(false);
  });
});
