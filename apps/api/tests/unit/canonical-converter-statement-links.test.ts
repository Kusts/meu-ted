import { describe, expect, it } from 'vitest';
import { BalanceError, resolveStatementLinks } from '../../src/scripts/canonical-converter/balances.js';

type Row = Record<string, unknown>;

/**
 * FINDING-1 RED suite: legacy card purchases may link to their transaction
 * via `card_purchases.transaction_id` while the transaction row itself
 * carries no `statement_id` (V032/V033 normalization). The converter must
 * backfill the canonical `statement_id` from that link BEFORE recomputing
 * balances — otherwise the purchase is debited from the wrong account.
 */
const stubPool = (data: { purchases?: Row[]; transactions?: Row[]; statements?: Row[] }) => {
  const calls: string[] = [];
  return {
    calls,
    query: async (sql: string, _params?: unknown[]) => {
      calls.push(sql);
      if (sql.includes('information_schema.tables')) {
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (sql.includes('information_schema.columns')) {
        // The fixture shape carries the legacy card flag.
        return { rows: [{ ok: true }], rowCount: 1 };
      }
      if (sql.includes('card_purchases') && sql.includes('transaction_id')) {
        return { rows: data.purchases ?? [], rowCount: (data.purchases ?? []).length };
      }
      if (sql.includes('is_credit_card_purchase')) {
        return {
          rows: (data.transactions ?? []).filter((r) => r['is_credit_card_purchase'] === true),
          rowCount: (data.transactions ?? []).filter((r) => r['is_credit_card_purchase'] === true).length,
        };
      }
      if (sql.includes('legacy_archive') && sql.includes('FROM') && sql.includes('transactions')) {
        return { rows: data.transactions ?? [], rowCount: (data.transactions ?? []).length };
      }
      if (sql.includes('statements')) {
        return { rows: data.statements ?? [], rowCount: (data.statements ?? []).length };
      }
      if (sql.includes('UPDATE')) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
};

describe('canonical converter statement-link resolution (FINDING-1)', () => {
  it('backfills the canonical statement_id from card_purchases.transaction_id', async () => {
    const pool = stubPool({
      purchases: [{ transaction_id: 'tx-1', statement_id: 'st-1', household_id: 'hh-1' }],
      transactions: [{ id: 'tx-1', is_credit_card_purchase: true, household_id: 'hh-1' }],
      statements: [{ id: 'st-1', household_id: 'hh-1' }],
    });
    const result = await resolveStatementLinks(pool as never, { schema: 'public' });
    expect(result.backfilled).toBe(1);
    expect(pool.calls.some((sql) => sql.includes('UPDATE') && sql.includes('statement_id'))).toBe(true);
  });

  it('fails closed on an orphan purchase (transaction_id without a transaction)', async () => {
    const pool = stubPool({
      purchases: [{ transaction_id: 'tx-ghost', statement_id: 'st-1', household_id: 'hh-1' }],
      transactions: [],
      statements: [{ id: 'st-1', household_id: 'hh-1' }],
    });
    await expect(resolveStatementLinks(pool as never, { schema: 'public' })).rejects.toThrow(BalanceError);
  });

  it('fails closed when a flagged purchase has no card_purchases row', async () => {
    const pool = stubPool({
      purchases: [],
      transactions: [{ id: 'tx-1', is_credit_card_purchase: true, household_id: 'hh-1' }],
      statements: [],
    });
    await expect(resolveStatementLinks(pool as never, { schema: 'public' })).rejects.toThrow(BalanceError);
  });

  it('fails closed when a purchase points at a missing statement', async () => {
    const pool = stubPool({
      purchases: [{ transaction_id: 'tx-1', statement_id: 'st-ghost', household_id: 'hh-1' }],
      transactions: [{ id: 'tx-1', is_credit_card_purchase: true, household_id: 'hh-1' }],
      statements: [],
    });
    await expect(resolveStatementLinks(pool as never, { schema: 'public' })).rejects.toThrow(BalanceError);
  });
});
