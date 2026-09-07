/**
 * C-04 (postgres impl, no live PG required): category cascade must issue
 * balance-reversal UPDATEs for every cascaded record inside the tx.
 *
 * A minimal fake pool honors the exact SQL shapes of deleteCategory; the
 * test asserts the store compensates expense (+amount) and income
 * (GREATEST(0, balance-amount)) accounts. Pre-fix code issued zero
 * `UPDATE accounts` statements here (verified RED by stashing the fix).
 */
import { describe, expect, it, vi } from 'vitest';
import { createPostgresWriteStore } from '../../src/writes/postgres.js';

const H = '00000000-0000-4000-8000-00000000000a';
const CAT = '11111111-1111-4111-8111-111111111111';

type Recorded = { text: string; values: unknown[] };

const txRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  household_id: H,
  kind: 'expense',
  description: 'Lunch',
  amount_cents: 1000,
  date: new Date('2026-06-10T00:00:00.000Z'),
  account_id: 'acc-1',
  category_id: CAT,
  subcategory_id: null,
  transfer_to_account_id: null,
  notes: null,
  ...overrides,
});

const makeFakePool = (txRows: Record<string, unknown>[]) => {
  const recorded: Recorded[] = [];
  const client = {
    query: vi.fn(async (text: string, values: unknown[] = []) => {
      recorded.push({ text, values });
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (text.includes('FROM categories') && text.includes('WHERE id = $1')) {
        return {
          rows: [{ id: CAT, household_id: H, name: 'Food', kind: 'expense', status: 'active' }],
          rowCount: 1,
        };
      }
      if (text.includes('FROM categories') && text.includes('parent_id = $2')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('FROM transactions') && text.includes('category_id = ANY')) {
        return { rows: txRows, rowCount: txRows.length };
      }
      if (text.startsWith('UPDATE accounts SET balance_cents')) return { rows: [], rowCount: 1 };
      if (text.includes('UPDATE transactions SET deleted_at')) return { rows: [], rowCount: txRows.length };
      if (text.includes('UPDATE categories SET status')) return { rows: [], rowCount: 1 };
      throw new Error(`unexpected query: ${text.slice(0, 80)}`);
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client), query: client.query };
  return { pool: pool as never, recorded };
};

describe('C-04 postgres cascade reverses balances (fake pool)', () => {
  it('reverses an expense (+amount) and an income (clamped) on cascade', async () => {
    const { pool, recorded } = makeFakePool([
      txRow({ id: 'tx-e', kind: 'expense', amount_cents: 1000, account_id: 'acc-1' }),
      txRow({ id: 'tx-i', kind: 'income', amount_cents: 500, account_id: 'acc-1' }),
    ]);
    const writes = createPostgresWriteStore({ pool });
    const res = await writes.deleteCategory(H, CAT, { mode: 'cascade', confirm: true });
    expect(res.softDeletedTransactions).toBe(2);

    const balanceUpdates = recorded.filter((q) => q.text.startsWith('UPDATE accounts SET balance_cents'));
    expect(balanceUpdates).toHaveLength(2);
    expect(balanceUpdates[0]!.text).toContain('balance_cents = balance_cents + $2');
    expect(balanceUpdates[0]!.values).toEqual(['acc-1', 1000, H]);
    expect(balanceUpdates[1]!.text).toContain('GREATEST(0, balance_cents - $2)');
    expect(balanceUpdates[1]!.values).toEqual(['acc-1', 500, H]);
  });

  it('reverses both transfer legs on cascade', async () => {
    const { pool, recorded } = makeFakePool([
      txRow({ id: 'tx-t', kind: 'transfer', amount_cents: 3000, account_id: 'acc-1', transfer_to_account_id: 'acc-2', category_id: CAT }),
    ]);
    const writes = createPostgresWriteStore({ pool });
    await writes.deleteCategory(H, CAT, { mode: 'cascade', confirm: true });

    const balanceUpdates = recorded.filter((q) => q.text.startsWith('UPDATE accounts SET balance_cents'));
    expect(balanceUpdates).toHaveLength(2);
    expect(balanceUpdates[0]!.values).toEqual(['acc-1', 3000, H]);
    expect(balanceUpdates[1]!.values).toEqual(['acc-2', 3000, H]);
  });
});
