/**
 * V4.1 PHASE 2 (Task 2.19, SPEC §9.11) — subscription legacy PATCH placeholders.
 *
 * RED against the current bug: `updateSubscription` in
 * `src/subscriptions/legacy-postgres.ts` emits FIXED placeholders
 * (`name = $3`, `amount_cents = $4`, …) while pushing only the provided
 * values, so any partial PATCH binds the wrong parameter (or none).
 *
 * The fake pool below mimics Postgres bind-arity checking: every `$n`
 * referenced by the UPDATE text must satisfy `n <= values.length`, or the
 * query fails exactly like `bind message supplies M parameters, but
 * prepared statement "S" requires N`. It then applies the `col = $n`
 * assignments so the test can assert per-field isolation and combinations.
 */

import { describe, expect, it } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import { createLegacyPostgresSubscriptionStore } from '../../src/subscriptions/legacy-postgres.js';

type FakeRow = Record<string, unknown>;

class FakePool {
  readonly updates: { text: string; values: unknown[] }[] = [];

  constructor(private readonly row: FakeRow) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<R extends QueryResultRow = any>(text: string, values: unknown[] = []): Promise<QueryResult<R>> {
    const upper = text.trim().toUpperCase();
    if (upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') {
      return { rows: [], rowCount: 0, command: upper, oid: 0, fields: [] } as QueryResult<R>;
    }
    if (upper.startsWith('SELECT')) {
      return { rows: [this.row] as unknown as R[], rowCount: 1, command: 'SELECT', oid: 0, fields: [] } as QueryResult<R>;
    }
    if (upper.startsWith('UPDATE SUBSCRIPTIONS')) {
      this.updates.push({ text, values });
      // Postgres bind-arity check: every $n must have a supplied value.
      const refs = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
      const max = Math.max(...refs);
      if (max > values.length) {
        throw new Error(
          `bind message supplies ${values.length} parameters, but prepared statement requires ${max}`,
        );
      }
      // Apply `column = $n` assignments to the fake row.
      for (const m of text.matchAll(/([a-z_]+)\s*=\s*\$(\d+)/gi)) {
        const col = m[1]!.toLowerCase();
        if (col === 'updated_at') continue;
        this.row[col] = values[Number(m[2]) - 1];
      }
      const out = {
        ...this.row,
        id: this.row['id'],
        household_id: this.row['household_id'],
        name: this.row['name'],
        amount_cents: this.row['amount_cents'],
        cycle: this.row['cycle'],
        day: this.row['day'],
        payment_method: this.row['payment_method'],
        status: this.row['status'],
        created_at: this.row['created_at'],
        cancelled_at: this.row['cancelled_at'],
      };
      return { rows: [out] as unknown as R[], rowCount: 1, command: 'UPDATE', oid: 0, fields: [] } as QueryResult<R>;
    }
    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult<R>;
  }

  async connect(): Promise<{ query: FakePool['query']; release: () => void }> {
    return { query: this.query.bind(this), release: () => undefined };
  }
}

const HOUSEHOLD = '00000000-0000-4000-8000-00000000000a';
const SUB_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const seedRow = (): FakeRow => ({
  id: SUB_ID,
  household_id: HOUSEHOLD,
  name: 'Netflix',
  amount_cents: 3990,
  cycle: 'monthly',
  day: 15,
  payment_method: 'credit_card',
  status: 'active',
  created_at: new Date('2026-07-01T12:00:00Z'),
  cancelled_at: null,
});

const buildStore = (row: FakeRow) => {
  const pool = new FakePool(row);
  const store = createLegacyPostgresSubscriptionStore(
    pool as unknown as Parameters<typeof createLegacyPostgresSubscriptionStore>[0],
  );
  return { store, pool };
};

describe('legacy subscription PATCH — dynamic placeholders', () => {
  it.each([
    ['name', { name: 'Netflix Premium' }, 'Netflix Premium'],
    ['amountCents', { amountCents: 5590 }, 5590],
    ['cycle', { cycle: 'yearly' }, 'yearly'],
    ['day', { day: 10 }, 10],
    ['paymentMethod', { paymentMethod: 'boleto' }, 'boleto'],
  ] as const)('updates only %s in isolation', async (_field, patch, _expected) => {
    const row = seedRow();
    const { store, pool } = buildStore(row);
    const updated = await store.updateSubscription(HOUSEHOLD, SUB_ID, patch);
    // Untouched columns keep their seeded values.
    expect(updated.name).toBe(patch.name ?? 'Netflix');
    expect(updated.amountCents).toBe(patch.amountCents ?? 3990);
    expect(updated.cycle).toBe(patch.cycle ?? 'monthly');
    expect(updated.day).toBe(patch.day ?? 15);
    expect(updated.paymentMethod).toBe(patch.paymentMethod ?? 'credit_card');
    // Placeholders are sequential from $3 (keys are $1/$2).
    const update = pool.updates[0]!;
    const refs = [...update.text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...refs)).toBe(update.values.length);
    expect(update.values).toEqual([SUB_ID, HOUSEHOLD, Object.values(patch)[0]]);
  });

  it('binds a late field (paymentMethod alone) to $3, not $7', async () => {
    const row = seedRow();
    const { store, pool } = buildStore(row);
    const updated = await store.updateSubscription(HOUSEHOLD, SUB_ID, {
      paymentMethod: 'pix',
    });
    expect(updated.paymentMethod).toBe('pix');
    expect(updated.name).toBe('Netflix');
    expect(pool.updates[0]!.text).toContain('payment_method = $3');
  });

  it('binds combinations sequentially (name + day → $3, $4)', async () => {
    const row = seedRow();
    const { store, pool } = buildStore(row);
    const updated = await store.updateSubscription(HOUSEHOLD, SUB_ID, {
      name: 'Combo',
      day: 20,
    });
    expect(updated.name).toBe('Combo');
    expect(updated.day).toBe(20);
    expect(updated.amountCents).toBe(3990);
    expect(pool.updates[0]!.text).toContain('name = $3');
    expect(pool.updates[0]!.text).toContain('day = $4');
    expect(pool.updates[0]!.values).toEqual([SUB_ID, HOUSEHOLD, 'Combo', 20]);
  });

  it('binds all five fields to $3..$7', async () => {
    const row = seedRow();
    const { store, pool } = buildStore(row);
    const updated = await store.updateSubscription(HOUSEHOLD, SUB_ID, {
      name: 'Full',
      amountCents: 100,
      cycle: 'yearly',
      day: 1,
      paymentMethod: 'pix',
    });
    expect(updated.name).toBe('Full');
    expect(updated.day).toBe(1);
    expect(pool.updates[0]!.values).toHaveLength(7);
  });

  it('rejects an empty patch without issuing an UPDATE', async () => {
    const row = seedRow();
    const { store, pool } = buildStore(row);
    await expect(store.updateSubscription(HOUSEHOLD, SUB_ID, {})).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(pool.updates).toHaveLength(0);
  });
});
