/**
 * V4.1 REVIEWFIX — stale `processing` claim must not 500 (Finding 3 [minor]).
 *
 * writes/postgres.ts treats any non-failed status as replay and returns
 * response (null for processing) → the route 500s. Expected:
 * - completed → replay response;
 * - processing + live lease → explicit 409 `idempotency.in_progress`, producer NOT run;
 * - processing + expired lease → take over the claim, run the producer,
 *   converge to a completed receipt on retry;
 * - failed → existing conflict behavior.
 *
 * Half 1 (always runs): fake-pool unit tests of the Postgres store.
 * Half 2 (PG-gated): real operation_records rows with stuck leases.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPostgresIdempotencyStore } from '../../src/writes/postgres.js';
import { hashPayloadV2 } from '../../src/writes/idempotency.js';

// ── Fake pool (in-memory fake of the PG claim table) ─────────────────────

type FakeRow = {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  payload_hash: string;
  response: unknown;
  lease_until: Date;
};

const makeFakePool = (seed: Array<{ key: string; row: FakeRow }> = []) => {
  const claims = new Map<string, FakeRow>(seed.map((s) => [s.key, s.row]));
  const nowPlus = (ms: number) => new Date(Date.now() + ms);
  const client = {
    release: () => undefined,
    query: async (text: string, values: unknown[] = []) => {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rowCount: 0, rows: [] };
      }
      if (text.includes('ON CONFLICT (workspace_id, idempotency_key) DO NOTHING')) {
        const key = String(values[3]);
        if (claims.has(key)) return { rowCount: 0, rows: [] };
        const row: FakeRow = {
          id: randomUUID(),
          status: 'processing',
          payload_hash: String(values[4]),
          response: null,
          lease_until: nowPlus(5 * 60_000),
        };
        claims.set(key, row);
        return { rowCount: 1, rows: [{ id: row.id, status: row.status, response: null, effect_ref: null }] };
      }
      if (text.includes("SET status = 'completed'")) {
        const id = String(values[0]);
        for (const row of claims.values()) {
          if (row.id === id) {
            row.status = 'completed';
            row.response = JSON.parse(String(values[2]));
          }
        }
        return { rowCount: 1, rows: [] };
      }
      if (text.includes('INSERT INTO audit_logs')) {
        return { rowCount: 1, rows: [] };
      }
      if (text.includes("SET status = 'processing'") && text.includes('lease_until <=')) {
        const key = String(values[1]);
        const row = claims.get(key);
        if (row && row.status === 'processing' && row.lease_until.getTime() <= Date.now()) {
          row.payload_hash = String(values[2]);
          row.lease_until = nowPlus(5 * 60_000);
          return { rowCount: 1, rows: [{ id: row.id }] };
        }
        return { rowCount: 0, rows: [] };
      }
      if (text.includes('FROM operation_records') && text.includes('SELECT')) {
        const key = String(values[1]);
        const row = claims.get(key);
        if (!row) return { rowCount: 0, rows: [] };
        return {
          rowCount: 1,
          rows: [{
            id: row.id,
            status: row.status,
            response: row.response,
            payload_hash: row.payload_hash,
            lease_until: row.lease_until,
          }],
        };
      }
      throw new Error(`fake-pool: unexpected query: ${text.slice(0, 80)}`);
    },
  };
  return {
    connect: async () => client,
    __claims: claims,
  };
};

const household = randomUUID();

describe('Finding 3 — Postgres store explicit processing branch (fake pool)', () => {
  it('stuck processing with a LIVE lease → 409 idempotency.in_progress, producer not executed', async () => {
    const key = `lease-live-${randomUUID()}`;
    const payload = { op: 'pay', amountCents: 100 };
    const fake = makeFakePool([{
      key,
      row: {
        id: randomUUID(),
        status: 'processing',
        payload_hash: hashPayloadV2(payload),
        response: null,
        lease_until: new Date(Date.now() + 5 * 60_000),
      },
    }]);
    const store = createPostgresIdempotencyStore({ pool: fake as never });
    let producerRuns = 0;

    await expect(
      store.lookupOrRecord(household, key, payload, async () => {
        producerRuns += 1;
        return { ok: true };
      }),
    ).rejects.toMatchObject({ code: 'idempotency.in_progress', statusCode: 409 });
    expect(producerRuns).toBe(0);
  });

  it('stuck processing with an EXPIRED lease → producer runs and converges to completed on retry', async () => {
    const key = `lease-expired-${randomUUID()}`;
    const payload = { op: 'pay', amountCents: 200 };
    const fake = makeFakePool([{
      key,
      row: {
        id: randomUUID(),
        status: 'processing',
        payload_hash: hashPayloadV2(payload),
        response: null,
        lease_until: new Date(Date.now() - 60_000),
      },
    }]);
    const store = createPostgresIdempotencyStore({ pool: fake as never });
    let producerRuns = 0;

    const first = await store.lookupOrRecord(household, key, payload, async () => {
      producerRuns += 1;
      return { ok: true, n: producerRuns };
    });
    expect(first.replayed).toBe(false);
    expect(first.response).toMatchObject({ ok: true });
    expect(producerRuns).toBe(1);

    const second = await store.lookupOrRecord(household, key, payload, async () => {
      producerRuns += 1;
      return { ok: true, n: producerRuns };
    });
    expect(second.replayed).toBe(true);
    expect(second.response).toMatchObject({ ok: true, n: 1 });
    expect(producerRuns).toBe(1);
  });

  it('completed still replays (no behavior change)', async () => {
    const key = `lease-done-${randomUUID()}`;
    const payload = { op: 'pay', amountCents: 300 };
    const fake = makeFakePool();
    const store = createPostgresIdempotencyStore({ pool: fake as never });

    const first = await store.lookupOrRecord(household, key, payload, async () => ({ ok: 'first' }));
    expect(first.replayed).toBe(false);
    const second = await store.lookupOrRecord(household, key, payload, async () => ({ ok: 'second' }));
    expect(second.replayed).toBe(true);
    expect(second.response).toMatchObject({ ok: 'first' });
  });
});

// ── PG-gated half: real stuck rows ────────────────────────────────────────

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log(
    '[postgres-idempotency-lease] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER are required — PG half skipped.',
  );
}

describeIfDb('Finding 3 — Postgres store explicit processing branch (real PG)', () => {
  let pool: import('pg').Pool;

  beforeAll(async () => {
    const { createPool } = await import('../../src/db/pool.js');
    const { requireTestDatabase } = await import('../../src/db/db-guard.js');
    const { runMigrations } = await import('../../src/read-models/sql/migrate.js');
    pool = createPool({ connectionString: DB_URL!, max: 4 });
    await requireTestDatabase(pool, 'postgres-idempotency-lease');
    await runMigrations(pool);
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  const insertStuckRow = async (key: string, payload: unknown, leaseSql: string) => {
    await pool.query(
      `INSERT INTO operation_records
         (workspace_id, actor_id, operation, idempotency_key, payload_hash, status,
          lease_until, retry_until, retention_until)
       VALUES ($1, 'device', 'write', $2, $3, 'processing',
               ${leaseSql}, NOW() + INTERVAL '7 days', NOW() + INTERVAL '90 days')`,
      [household, key, hashPayloadV2(payload)],
    );
  };
  const deleteRow = async (key: string) => {
    await pool.query(
      'DELETE FROM audit_logs WHERE operation_record_id IN (SELECT id FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2)',
      [household, key],
    );
    await pool.query('DELETE FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2', [
      household,
      key,
    ]);
  };

  it('stuck processing with a LIVE lease → 409 in_progress, producer not executed', async () => {
    const key = `pg-lease-live-${randomUUID()}`;
    const payload = { op: 'pay', amountCents: 111 };
    const store = createPostgresIdempotencyStore({ pool });
    let producerRuns = 0;
    try {
      await insertStuckRow(key, payload, `NOW() + INTERVAL '5 minutes'`);
      await expect(
        store.lookupOrRecord(household, key, payload, async () => {
          producerRuns += 1;
          return { ok: true };
        }),
      ).rejects.toMatchObject({ code: 'idempotency.in_progress', statusCode: 409 });
      expect(producerRuns).toBe(0);
    } finally {
      await deleteRow(key);
    }
  }, 30_000);

  it('stuck processing with an EXPIRED lease → takeover runs the producer and converges', async () => {
    const key = `pg-lease-expired-${randomUUID()}`;
    const payload = { op: 'pay', amountCents: 222 };
    const store = createPostgresIdempotencyStore({ pool });
    let producerRuns = 0;
    try {
      await insertStuckRow(key, payload, `NOW() - INTERVAL '1 minute'`);
      const first = await store.lookupOrRecord(household, key, payload, async () => {
        producerRuns += 1;
        return { ok: 'taken-over' };
      });
      expect(first.replayed).toBe(false);
      expect(first.response).toMatchObject({ ok: 'taken-over' });
      const stored = await pool.query(
        'SELECT status FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2',
        [household, key],
      );
      expect(stored.rows[0]?.status).toBe('completed');
      const second = await store.lookupOrRecord(household, key, payload, async () => {
        producerRuns += 1;
        return { ok: 'again' };
      });
      expect(second.replayed).toBe(true);
      expect(producerRuns).toBe(1);
    } finally {
      await deleteRow(key);
    }
  }, 30_000);
});
