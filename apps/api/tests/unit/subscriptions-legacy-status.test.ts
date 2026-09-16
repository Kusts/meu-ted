/**
 * Unit test — regression guard for legacy subscription adapter.
 *
 * The legacy schema defined in V009 (`src/read-models/sql/V009__categories_parent_subscriptions.sql`)
 * creates `subscriptions` with a `status TEXT` column ('active'|'cancelled'),
 * NOT an `active BOOLEAN` column.
 *
 * The legacy adapter (`src/subscriptions/legacy-postgres.ts`) historically
 * assumed `active BOOLEAN` and shipped that way; that assumption was wrong
 * for the V009 schema and produced `column "active" does not exist` at
 * runtime on the live VPS.
 *
 * This test feeds the legacy adapter a fake Pool that:
 *   - simulates a V009-shaped table (has `status`, NO `active` column);
 *   - rejects any SQL that still references `active` as a column.
 *
 * If the adapter regresses to `active`, every operation fails and the
 * test fails. Once the adapter is fixed to use `status`, all operations
 * complete and the test passes.
 *
 * Runs without DATABASE_URL — pure in-memory fake pool.
 */

import { describe, it, expect } from 'vitest';
import type { QueryResult, QueryResultRow } from 'pg';
import { createLegacyPostgresSubscriptionStore } from '../../src/subscriptions/legacy-postgres.js';
import type { SubscriptionStore } from '../../src/subscriptions/store.js';

type FakeRow = Record<string, unknown> & {
  id: string;
  household_id: string;
  name: string;
  amount_cents: number;
  cycle: string;
  day: number;
  payment_method: string;
  status: string;
  created_at: Date;
  cancelled_at: Date | null;
};

class FakeQueryRunner {
  /** Every SQL string the adapter issued, in order. */
  readonly queries: string[] = [];

  constructor(private readonly rows: FakeRow[], private readonly householdId: string) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query<R extends QueryResultRow = any>(
    text: string,
    _values?: unknown[],
  ): Promise<QueryResult<R>> {
    this.queries.push(text);

    // Regression guard: the V009 schema has NO `active` column on `subscriptions`.
    // If the adapter regresses, surface it loudly with a column-shaped error
    // mirroring the production failure mode.
    if (
      /(?:^|[^A-Za-z0-9_'])active(?![A-Za-z0-9_'])/.test(text) &&
      /FROM\s+subscriptions|INTO\s+subscriptions|UPDATE\s+subscriptions/i.test(text)
    ) {
      throw new Error('column "active" does not exist');
    }

    const upper = text.trim().toUpperCase();

    // BEGIN / COMMIT / ROLLBACK — withTransaction bookkeeping.
    if (upper === 'BEGIN' || upper === 'COMMIT' || upper === 'ROLLBACK') {
      return { rows: [], rowCount: 0, command: upper, oid: 0, fields: [] } as QueryResult<R>;
    }

    // INSERT … RETURNING — append the freshly created row shaped like V009.
    if (upper.startsWith('INSERT INTO SUBSCRIPTIONS')) {
      const valuesArr = (_values as unknown[] | undefined) ?? [];
      const id = (valuesArr[0] as string | undefined) ?? crypto.randomUUID();
      const householdId = (valuesArr[1] as string | undefined) ?? this.householdId;
      const name = (valuesArr[2] as string | undefined) ?? 'Netflix';
      const amountCents = (valuesArr[3] as number | undefined) ?? 3990;
      const cycle = (valuesArr[4] as string | undefined) ?? 'monthly';
      const day = (valuesArr[5] as number | undefined) ?? 15;
      const paymentMethod = (valuesArr[6] as string | undefined) ?? 'credit_card';
      const row: FakeRow = {
        id,
        household_id: householdId,
        name,
        amount_cents: amountCents,
        cycle,
        day,
        payment_method: paymentMethod,
        status: 'active',
        created_at: new Date('2026-07-01T12:00:00Z'),
        cancelled_at: null,
      };
      this.rows.push(row);
      return { rows: [row as unknown as R], rowCount: 1, command: 'INSERT', oid: 0, fields: [] } as QueryResult<R>;
    }

    // UPDATE … RETURNING — flip status to cancelled.
    if (upper.startsWith('UPDATE SUBSCRIPTIONS')) {
      const valuesArr = (_values as unknown[] | undefined) ?? [];
      const idMatch = text.match(/id\s*=\s*\$(\d+)/i);
      const householdMatch = text.match(/household_id\s*=\s*\$(\d+)/i);
      const wantedId = idMatch ? valuesArr[Number(idMatch[1]) - 1] as string : undefined;
      const wantedHousehold = householdMatch ? valuesArr[Number(householdMatch[1]) - 1] as string : undefined;
      const target = this.rows.find((r) =>
        (wantedId ? r.id === wantedId : true) &&
        (wantedHousehold ? r.household_id === wantedHousehold : true),
      );
      if (target) {
        target.status = 'cancelled';
        target.cancelled_at = new Date('2026-07-02T12:00:00Z');
      }
      return {
        rows: target ? [target as unknown as R] : [],
        rowCount: target ? 1 : 0,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      } as QueryResult<R>;
    }

    // SELECT … FROM subscriptions
    if (/FROM\s+SUBSCRIPTIONS/.test(upper)) {
      // Parse WHERE placeholders in order so we filter exactly like
      // parameterized Postgres would. Each `id = $n` / `household_id = $n`
      // / `status = $n` clause reads from values[n-1].
      const valuesArr = (_values as unknown[] | undefined) ?? [];
      const idMatch = text.match(/\bid\s*=\s*\$(\d+)/i);
      const householdMatch = text.match(/household_id\s*=\s*\$(\d+)/i);
      const statusLiteralMatch = text.match(/status\s*=\s*'([a-z]+)'/i);
      const statusParamMatch = text.match(/status\s*=\s*\$(\d+)/i);
      const wantedId = idMatch ? valuesArr[Number(idMatch[1]) - 1] as string : undefined;
      const wantedHousehold = householdMatch ? valuesArr[Number(householdMatch[1]) - 1] as string : undefined;
      const wantedStatus = statusLiteralMatch
        ? statusLiteralMatch[1]
        : statusParamMatch
          ? valuesArr[Number(statusParamMatch[1]) - 1] as string
          : undefined;
      const filtered = this.rows.filter((r) => {
        if (wantedId && r.id !== wantedId) return false;
        if (wantedHousehold && r.household_id !== wantedHousehold) return false;
        if (wantedStatus && r.status !== wantedStatus) return false;
        return true;
      });
      return {
        rows: filtered as unknown as R[],
        rowCount: filtered.length,
        command: 'SELECT',
        oid: 0,
        fields: [],
      } as QueryResult<R>;
    }

    return { rows: [], rowCount: 0, command: '', oid: 0, fields: [] } as QueryResult<R>;
  }
}

class FakeClient {
  constructor(
    private readonly runner: FakeQueryRunner,
    private readonly released: { v: boolean },
  ) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
    return this.runner.query<R>(text, values);
  }
  release(): void {
    this.released.v = true;
  }
}

class FakePool {
  readonly rows: FakeRow[] = [];
  readonly runner: FakeQueryRunner;
  private readonly householdId: string;
  private readonly released = { v: false };

  constructor(householdId: string) {
    this.householdId = householdId;
    this.runner = new FakeQueryRunner(this.rows, householdId);
  }

  // Pool-level query (non-transactional) — same runner.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query<R extends QueryResultRow = any>(text: string, values?: unknown[]): Promise<QueryResult<R>> {
    return this.runner.query<R>(text, values);
  }

  async connect(): Promise<FakeClient> {
    this.released.v = false;
    return new FakeClient(this.runner, this.released);
  }

  /** Test helper: exposes every query issued through either pool.query or a tx client. */
  get queries(): string[] {
    return this.runner.queries;
  }
}

const HOUSEHOLD = '00000000-0000-4000-8000-00000000000a';

const buildAdapter = (): { store: SubscriptionStore; pool: FakePool } => {
  const pool = new FakePool(HOUSEHOLD);
  const store = createLegacyPostgresSubscriptionStore(pool as unknown as Parameters<typeof createLegacyPostgresSubscriptionStore>[0]);
  return { store, pool };
};

describe('legacy subscription adapter — status column (not active boolean)', () => {
  it('createSubscription does not reference the obsolete `active` column', async () => {
    const { store, pool } = buildAdapter();
    const sub = await store.createSubscription(HOUSEHOLD, {
      name: 'Netflix',
      amountCents: 3990,
      cycle: 'monthly',
      day: 15,
      paymentMethod: 'credit_card',
    });
    expect(sub.status).toBe('active');
    expect(sub.name).toBe('Netflix');
    expect(sub.amountCents).toBe(3990);
    // All SQL issued must avoid `active` — guard would have thrown otherwise.
    const _colActive = (q: string): boolean =>
      /(?:^|[^A-Za-z0-9_'])active(?![A-Za-z0-9_'])/.test(q) &&
      /FROM\s+subscriptions|INTO\s+subscriptions|UPDATE\s+subscriptions/i.test(q);
    expect(pool.queries.some(_colActive)).toBe(false);
  });

  it('listSubscriptions does not reference the obsolete `active` column', async () => {
    const { store, pool } = buildAdapter();
    await store.createSubscription(HOUSEHOLD, {
      name: 'Spotify',
      amountCents: 1990,
      cycle: 'monthly',
      day: 10,
      paymentMethod: 'credit_card',
    });
    pool.queries.length = 0;
    const active = await store.listSubscriptions(HOUSEHOLD, 'active');
    expect(active).toHaveLength(1);
    expect(active[0]!.status).toBe('active');
    const cancelled = await store.listSubscriptions(HOUSEHOLD, 'cancelled');
    expect(cancelled).toHaveLength(0);
    const _colActive = (q: string): boolean =>
      /(?:^|[^A-Za-z0-9_'])active(?![A-Za-z0-9_'])/.test(q) &&
      /FROM\s+subscriptions|INTO\s+subscriptions|UPDATE\s+subscriptions/i.test(q);
    expect(pool.queries.some(_colActive)).toBe(false);
  });

  it('cancelSubscription does not reference the obsolete `active` column', async () => {
    const { store, pool } = buildAdapter();
    const created = await store.createSubscription(HOUSEHOLD, {
      name: 'Azure',
      amountCents: 29900,
      cycle: 'monthly',
      day: 1,
      paymentMethod: 'credit_card',
    });
    pool.queries.length = 0;
    const cancelled = await store.cancelSubscription(HOUSEHOLD, created.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledAt).toBeDefined();
    const _colActive = (q: string): boolean =>
      /(?:^|[^A-Za-z0-9_'])active(?![A-Za-z0-9_'])/.test(q) &&
      /FROM\s+subscriptions|INTO\s+subscriptions|UPDATE\s+subscriptions/i.test(q);
    expect(pool.queries.some(_colActive)).toBe(false);
  });

  it('getSubscription does not reference the obsolete `active` column', async () => {
    const { store, pool } = buildAdapter();
    const created = await store.createSubscription(HOUSEHOLD, {
      name: 'Disney+',
      amountCents: 4590,
      cycle: 'monthly',
      day: 10,
      paymentMethod: 'credit_card',
    });
    pool.queries.length = 0;
    const fetched = await store.getSubscription(HOUSEHOLD, created.id);
    expect(fetched?.status).toBe('active');
    expect(fetched?.name).toBe('Disney+');
    const _colActive = (q: string): boolean =>
      /(?:^|[^A-Za-z0-9_'])active(?![A-Za-z0-9_'])/.test(q) &&
      /FROM\s+subscriptions|INTO\s+subscriptions|UPDATE\s+subscriptions/i.test(q);
    expect(pool.queries.some(_colActive)).toBe(false);
  });

  it('full lifecycle: create → list(active=1) → cancel → list(active=0, cancelled=1)', async () => {
    const { store } = buildAdapter();
    const sub = await store.createSubscription(HOUSEHOLD, {
      name: 'ChatGPT Plus',
      amountCents: 5900,
      cycle: 'monthly',
      day: 3,
      paymentMethod: 'credit_card',
    });
    expect(await store.listSubscriptions(HOUSEHOLD, 'active')).toHaveLength(1);
    await store.cancelSubscription(HOUSEHOLD, sub.id);
    expect(await store.listSubscriptions(HOUSEHOLD, 'active')).toHaveLength(0);
    expect(await store.listSubscriptions(HOUSEHOLD, 'cancelled')).toHaveLength(1);
  });
});