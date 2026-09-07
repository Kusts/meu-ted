/**
 * H-04: concurrent statement creation converges on a single row.
 *
 * findOrCreateStatementTx issues INSERT ... ON CONFLICT DO NOTHING +
 * SELECT. This test drives two interleaved calls against a fake executor
 * that emulates unique-index semantics (second INSERT with the same key
 * inserts nothing) and asserts both callers receive the same statement id
 * with exactly one row stored — the race the old SELECT-then-INSERT lost.
 */
import { describe, expect, it, vi } from 'vitest';
import { findOrCreateStatementTx } from '../../src/cards/postgres.js';

type Row = Record<string, unknown>;

const makeRacyExec = () => {
  const stored: Row[] = [];
  const query = vi.fn(async (text: string, values: unknown[] = []) => {
    // Force interleaving: every query yields to the microtask queue so the
    // two concurrent callers overlap exactly like real connections would.
    await Promise.resolve();
    if (text.includes('ON CONFLICT')) {
      const [householdId, accountId, cycle] = values as string[];
      const dup = stored.some(
        (r) => r['household_id'] === householdId && r['account_id'] === accountId && r['cycle_year_month'] === cycle,
      );
      if (!dup) {
        stored.push({
          id: `stmt-${stored.length + 1}`,
          household_id: householdId,
          account_id: accountId,
          cycle_year_month: cycle,
        });
      }
      return { rows: [], rowCount: dup ? 0 : 1 };
    }
    if (text.includes('SELECT id FROM statements')) {
      const [accountId, householdId, cycle] = values as string[];
      const hit = stored.find(
        (r) => r['account_id'] === accountId && r['household_id'] === householdId && r['cycle_year_month'] === cycle,
      );
      return { rows: hit ? [{ id: hit['id'] }] : [], rowCount: hit ? 1 : 0 };
    }
    throw new Error(`unexpected query: ${text.slice(0, 60)}`);
  });
  return { exec: { query }, stored, query };
};

describe('H-04 statement upsert converges under concurrency', () => {
  it('two interleaved same-cycle upserts return one shared statement id', async () => {
    const { exec, stored, query } = makeRacyExec();
    const [a, b] = await Promise.all([
      findOrCreateStatementTx(exec, 'h1', 'card1', '2026-08', '2026-08-15', '2026-08-25'),
      findOrCreateStatementTx(exec, 'h1', 'card1', '2026-08', '2026-08-15', '2026-08-25'),
    ]);
    expect(a).toBe(b);
    expect(stored).toHaveLength(1);
    expect(query.mock.calls.filter(([t]) => (t as string).includes('ON CONFLICT'))).toHaveLength(2);
  });

  it('different cycles still create distinct statements', async () => {
    const { exec, stored } = makeRacyExec();
    const a = await findOrCreateStatementTx(exec, 'h1', 'card1', '2026-08', '2026-08-15', '2026-08-25');
    const b = await findOrCreateStatementTx(exec, 'h1', 'card1', '2026-09', '2026-09-15', '2026-09-25');
    expect(a).not.toBe(b);
    expect(stored).toHaveLength(2);
  });

  it('uses ON CONFLICT on the household/account/cycle key', async () => {
    const { exec, query } = makeRacyExec();
    await findOrCreateStatementTx(exec, 'h1', 'card1', '2026-08', '2026-08-15', '2026-08-25');
    const insert = query.mock.calls.map(([t]) => t as string).find((t) => t.includes('ON CONFLICT'))!;
    expect(insert).toContain('ON CONFLICT (household_id, account_id, cycle_year_month) DO NOTHING');
  });
});
