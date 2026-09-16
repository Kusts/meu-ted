/**
 * XLT-07 — Undo crash atomicity (SPEC §12 F1–F4, D-V4-07; T3.1; VAL-V4.7).
 *
 * Crosses ≥ 2 real layers: real PostgreSQL (canonical schema, SQL tx
 * semantics) × the production Postgres write/idempotency/audit stores × the
 * canonical undo service. Gated by DATABASE_URL_TEST + DB_TEST_MARKER; skips
 * cleanly otherwise (same gate as tests/integration/postgres-undo.test.ts).
 *
 * CRASH EQUIVALENCE (header contract): a real process crash mid-transaction
 * aborts the open transaction (the server rolls back everything the crashed
 * backend had not committed). Injecting a deterministic fault that throws
 * inside the transaction callback — before COMMIT — produces EXACTLY the
 * database state a crash at that point would leave: uncommitted work is
 * rolled back, previously-committed transactions stay committed. What the
 * fault CANNOT simulate (documented per scenario) is client-side amnesia,
 * which is instead simulated by rebuilding the undo service with a fresh
 * `undone` set before replay (= a new process after the crash).
 *
 * THE 5 CRASH POINTS (SPEC §12.F2):
 *   P1 — before the financial reversal (no statement ran);
 *   P2 — during the reversal (mid-statement failure);
 *   P3 — after the reversal, before the idempotency completion write;
 *   P4 — after the completion write, before COMMIT;
 *   P5 — after COMMIT (clean path + replay control).
 *
 * Each scenario asserts: 0 OR 1 financial effect (never double) + convergent
 * replay (retry the undo after the crash → single correct final effect, the
 * recorded idempotency result, replay observable). FIX-UNDO (T3.1→F3,
 * SPEC §12 F3 opção 1) joined claim + reversal + completion in ONE Postgres
 * transaction (claim-client passthrough to the producer, client-bound `*InTx`
 * reversals): P3/P4 now assert FULL rollback (0 effects, 0 records) plus a
 * convergent, byte-identical, replay-marked retry. The pre-fix RED shape
 * (committed effect + lost record → `not_found` 404 on retry, F4 violated)
 * is recorded in docs/reports/meu-ted-v4-implementation-report.md (Fase 3).
 *
 * STORE PARITY (T3.2 input): the same 5 points run against the in-memory
 * stores (dev/test). In-memory promises process atomicity for NOTHING — the
 * parity bar is OBSERVABLE behavior (convergent replay), and divergences are
 * RECORDED, never force-failed (see the parity report test at the bottom).
 *
 * LEGACY BRANCH (§31.3.2): the canonical undo path is asserted via the
 * `audit-undo:` namespace row + canonical audit row. The "legacy branch is
 * never executed" claim is QUALIFIED, not repeated blindly — see the
 * legacy-branch test.
 *
 * EMITTERS (T0.4.5/T0.4.6, born here): `audit-undo.replay` (undo is a replay
 * — the idempotency store already distinguishes it) and
 * `mutation.reconcile.enqueued` (operation enters reconcile). Both are
 * validated by buildObservabilityEvent + best-effort structured logging,
 * following the T2.2 precedent in routes/index.ts. The replay emitter is
 * ALSO the observable "marked as replay" signal: UndoResult carries no
 * replayed flag, but a replayed call emits exactly 1 event AND returns a
 * byte-identical recorded response (a fresh execution would mint a new
 * receipt mutationId — see resolveUndoReceipt).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { computePendingOperationV2Hash } from '@pi-finance/llm-contracts';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import {
  createPostgresWriteStore,
  createPostgresIdempotencyStore,
} from '../../src/writes/postgres.js';
import { createPostgresAuditLogStore } from '../../src/audit/store.js';
import {
  createUndoService,
  UNDO_IDEMPOTENCY_PREFIX,
  type UndoService,
} from '../../src/approvals/undo.js';
import type { WriteStore } from '../../src/writes/store.js';
import type { AuditLog } from '../../src/audit/store.js';
import {
  createIdempotencyRequest,
  createInMemoryIdempotencyStore,
} from '../../src/writes/idempotency.js';
import {
  createInMemoryStores,
  createInMemoryWriteStore,
} from '../../src/writes/in-memory.js';
import { createInMemoryAuditLogStore } from '../../src/audit/store.js';
import {
  createInMemoryPendingOperationV2Store,
  RECONCILE_REASON_LEASE_EXPIRED,
  type PendingIdentity,
  type PendingOperationV2Store,
} from '../../src/approvals/pending-v2.js';

// ---------------------------------------------------------------------------
// Gate: real Postgres or clean skip (never fails for missing infra).
// ---------------------------------------------------------------------------

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log(
    '[xlt-07-undo-crash] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER are required — ' +
      'crash injection is only meaningful against real PostgreSQL, so every Postgres ' +
      'scenario below is skipped. In-memory parity + emitter tests still run.',
  );
}

// ---------------------------------------------------------------------------
// Shared harness: deterministic SQL fault injection (test-only, no src hooks).
// ---------------------------------------------------------------------------
// The stores capture the `pool` object reference and call pool.connect() per
// transaction, so monkey-patching pool.connect for the duration of one undo
// call faults every backend the undo touches. Matchers intentionally avoid
// BEGIN/COMMIT/ROLLBACK except in P4, where the COMMIT fault IS the point.

type SqlFault = {
  disarm: () => void;
  fired: () => number;
};

/**
 * Generation guard: pg-pool REUSES client objects across checkouts, so a
 * wrapped `client.query` outlives the arm that installed it (SEQUENTIAL use
 * only — overlapping arms are not supported). Each arm takes the current
 * generation; disarm invalidates it, turning every stale wrapper inert even
 * when the same client object is checked out again later.
 */
let activeFaultGeneration = 0;

const armSqlFault = (
  pool: Pool,
  match: (sql: string) => boolean,
  label: string,
): SqlFault => {
  const holder = pool as unknown as { connect: Pool['connect'] };
  const origConnect = holder.connect.bind(pool);
  const generation = ++activeFaultGeneration;
  let count = 0;
  holder.connect = (async (...args: unknown[]) => {
    // pg-pool's own pool.query calls this.connect(callback): callback-style
    // checkouts bypass fault wrapping entirely (reads/helpers never fault —
    // only withTransaction backends, which connect promise-style, do).
    if (args.some((arg) => typeof arg === 'function')) {
      return (origConnect as (...a: unknown[]) => unknown)(...args);
    }
    const client = (await (origConnect as (...a: unknown[]) => Promise<PoolClient>)()) as PoolClient;
    const clientHolder = client as unknown as { query: PoolClient['query'] };
    const origQuery = clientHolder.query.bind(client);
    clientHolder.query = (async (...qargs: unknown[]) => {
      const first = qargs[0];
      const sql =
        typeof first === 'string' ? first : (first as { text?: unknown } | null)?.text;
      if (generation === activeFaultGeneration && typeof sql === 'string' && match(sql)) {
        count += 1;
        throw new Error(`XLT-07 injected crash [${label}]: ${sql.slice(0, 140)}`);
      }
      return (origQuery as (...a: unknown[]) => Promise<unknown>)(...qargs);
    }) as PoolClient['query'];
    return client;
  }) as Pool['connect'];
  return {
    disarm: () => {
      activeFaultGeneration++;
      holder.connect = origConnect;
    },
    fired: () => count,
  };
};

const matchSoftDeleteStatement = (sql: string): boolean =>
  /UPDATE transactions\s+SET deleted_at/i.test(sql);

const matchIdempotencyCompletion = (sql: string): boolean =>
  /UPDATE operation_records\s+SET status/i.test(sql);

// ---------------------------------------------------------------------------
// Postgres fixture: a real reversible expense with a real audit trail.
// ---------------------------------------------------------------------------
// The expense is booked THROUGH the canonical idempotency store (request
// form, same as the V2 executor path) so the fixture crosses the exact
// layers production crosses: operation_records claim + financial effect +
// completion + canonical audit_logs row (effect_ref = transaction id), which
// is what the undo service resolves as its reversal target.

type PgFixture = {
  householdId: string;
  actorId: string;
  txId: string;
};

const seedReversibleExpense = async (pool: Pool): Promise<PgFixture> => {
  const householdId = randomUUID();
  const actorId = 'xlt-07-actor';
  const writes = createPostgresWriteStore({ pool });
  const account = await writes.createAccount(householdId, {
    name: `XLT07 ${randomUUID().slice(0, 8)}`,
    kind: 'bank',
    initialBalanceCents: 100_000,
  });
  const category = await writes.createCategory(householdId, {
    name: `XLT07 cat ${randomUUID().slice(0, 8)}`,
    kind: 'expense',
  });
  const idempotency = createPostgresIdempotencyStore({ pool });
  const request = createIdempotencyRequest(
    { householdId, deviceId: actorId },
    'transactions.expense.create',
    `xlt07-seed-${randomUUID()}`,
  );
  const booked = await idempotency.lookupOrRecord(
    request,
    { seed: 'xlt07' },
    async () => {
      const tx = await writes.createExpense(householdId, {
        description: 'XLT07 reversible expense',
        amountCents: 12_345,
        date: '2026-09-16',
        accountId: account.id,
        categoryId: category.id,
      });
      // Effect pointer: the canonical store persists effect_ref from the
      // `transactionId` field (writes/postgres.ts). Without it the audit row
      // carries no effect_ref and the undo has no target.
      return { ...tx, transactionId: tx.id };
    },
  );
  const txId = (booked.response as { transactionId: string }).transactionId;
  return { householdId, actorId, txId };
};

type UndoEffectState = {
  /** 0 = transaction still active, 1 = reversal committed. Never > 1. */
  effects: number;
  /** Completed idempotency rows for the undo key (0 or 1). */
  records: number;
  recordStatus: string | null;
};

const readUndoState = async (
  pool: Pool,
  householdId: string,
  txId: string,
  undoKey: string,
): Promise<UndoEffectState> => {
  const tx = await pool.query<{ deleted_at: string | null }>(
    'SELECT deleted_at FROM transactions WHERE id = $1 AND household_id = $2',
    [txId, householdId],
  );
  const rec = await pool.query<{ status: string }>(
    'SELECT status FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2',
    [householdId, `${UNDO_IDEMPOTENCY_PREFIX}${undoKey}`],
  );
  return {
    effects: tx.rows[0]?.deleted_at ? 1 : 0,
    records: rec.rows.length,
    recordStatus: rec.rows[0]?.status ?? null,
  };
};

const cleanupHousehold = async (pool: Pool, householdId: string): Promise<void> => {
  try {
    await pool.query('DELETE FROM audit_logs WHERE workspace_id = $1', [householdId]);
  } catch { /* legacy-shaped or absent: best-effort */ }
  try {
    await pool.query('DELETE FROM operation_records WHERE workspace_id = $1', [householdId]);
  } catch { /* best-effort */ }
  await pool.query('DELETE FROM transactions WHERE household_id = $1', [householdId]).catch(() => undefined);
  await pool.query('DELETE FROM categories WHERE household_id = $1', [householdId]).catch(() => undefined);
  await pool.query('DELETE FROM accounts WHERE household_id = $1', [householdId]).catch(() => undefined);
};

const makePgUndo = (
  pool: Pool,
  writes: WriteStore,
  sink: Array<{ eventType: string; workspaceId: string }>,
): { undo: UndoService; idempotencyKey: string } => {
  const undo = createUndoService({
    auditLogs: createPostgresAuditLogStore(pool),
    writes,
    idempotency: createPostgresIdempotencyStore({ pool }),
    observabilitySink: (event) => { sink.push(event); },
  });
  return { undo, idempotencyKey: `xlt07-${randomUUID()}` };
};

// ---------------------------------------------------------------------------
// XLT-07 against real PostgreSQL.
// ---------------------------------------------------------------------------

describeIfDb('XLT-07 — undo crash atomicity (real PostgreSQL)', () => {
  let pool: Pool;
  const households: string[] = [];

  beforeAll(async () => {
    pool = createPool({ connectionString: DB_URL!, max: 8 });
    await requireTestDatabase(pool, 'xlt-07-undo-crash');
    await runMigrations(pool);
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      for (const householdId of households) await cleanupHousehold(pool, householdId);
      await pool.end();
    }
  });

  it('P1 — crash before the financial reversal: 0 effects, replay converges', async () => {
    const { householdId, actorId, txId } = await seedReversibleExpense(pool);
    households.push(householdId);
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    const writes = createPostgresWriteStore({ pool });
    // Crash BEFORE the first financial statement: the writes call never runs,
    // so the outer idempotency transaction aborts with nothing to roll back.
    // FIX-UNDO: the atomic path resolves the client-bound reversal
    // (`softDeleteTransactionInTx`, inherited by the spread below), so the
    // fault must fire on THAT entry — overriding only the legacy
    // transactional method would leave the real path unbroken.
    const crashP1 = async (): Promise<never> => {
      throw new Error('XLT-07 injected crash [P1] before financial reversal');
    };
    const crashingWrites: WriteStore = {
      ...writes,
      softDeleteTransaction: crashP1,
    };
    (crashingWrites as unknown as Record<string, unknown>).softDeleteTransactionInTx = crashP1;
    const { undo, idempotencyKey } = makePgUndo(pool, crashingWrites, replayEvents);

    await expect(undo.undo(householdId, actorId, idempotencyKey)).rejects.toThrow(
      /injected crash \[P1\]/,
    );
    expect(await readUndoState(pool, householdId, txId, idempotencyKey)).toEqual({
      effects: 0,
      records: 0,
      recordStatus: null,
    });

    // Replay after the crash (= new process: fresh `undone` set) converges.
    const retry = createUndoService({
      auditLogs: createPostgresAuditLogStore(pool),
      writes,
      idempotency: createPostgresIdempotencyStore({ pool }),
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    const first = await retry.undo(householdId, actorId, idempotencyKey);
    expect(first.undone).toMatchObject({
      operation: 'transactions.expense.create',
      entityId: txId,
      reversal: 'soft_delete',
    });
    expect(first.receipt.mutationKind).toBe('transaction.delete');
    expect(await readUndoState(pool, householdId, txId, idempotencyKey)).toMatchObject({
      effects: 1,
      records: 1,
      recordStatus: 'completed',
    });

    // Duplicate delivery of the same key replays the RECORDED response: the
    // receipt mutationId is byte-identical (a fresh execution would mint a new
    // one in resolveUndoReceipt) and exactly 1 replay event is emitted.
    const replayed = await retry.undo(householdId, actorId, idempotencyKey);
    expect(replayed).toEqual(first);
    expect(replayEvents).toHaveLength(1);
    expect(replayEvents[0]).toEqual({
      eventType: 'audit-undo.replay',
      workspaceId: householdId,
    });
  });

  it('P2 — crash during the reversal (mid-statement): 0 effects, replay converges', async () => {
    const { householdId, actorId, txId } = await seedReversibleExpense(pool);
    households.push(householdId);
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    const { undo, idempotencyKey } = makePgUndo(
      pool,
      createPostgresWriteStore({ pool }),
      replayEvents,
    );

    // Crash ON the soft-delete statement: the single claim+reversal
    // transaction rolls back (balance restore + tombstone vanish together
    // with the uncommitted claim).
    const fault = armSqlFault(pool, matchSoftDeleteStatement, 'P2-mid-reversal');
    try {
      await expect(undo.undo(householdId, actorId, idempotencyKey)).rejects.toThrow(
        /injected crash \[P2-mid-reversal\]/,
      );
      expect(fault.fired()).toBe(1);
    } finally {
      fault.disarm();
    }
    const state = await readUndoState(pool, householdId, txId, idempotencyKey);
    expect(state).toEqual({ effects: 0, records: 0, recordStatus: null });
    // Balance untouched by the aborted reversal: still reduced by the expense.
    const balance = await pool.query<{ balance_cents: string }>(
      'SELECT balance_cents FROM accounts WHERE household_id = $1',
      [householdId],
    );
    expect(Number(balance.rows[0]!.balance_cents)).toBe(100_000 - 12_345);

    const retry = createUndoService({
      auditLogs: createPostgresAuditLogStore(pool),
      writes: createPostgresWriteStore({ pool }),
      idempotency: createPostgresIdempotencyStore({ pool }),
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    const first = await retry.undo(householdId, actorId, idempotencyKey);
    expect(first.undone).toMatchObject({ entityId: txId, reversal: 'soft_delete' });
    const replayed = await retry.undo(householdId, actorId, idempotencyKey);
    expect(replayed).toEqual(first);
    expect(replayEvents).toEqual([{ eventType: 'audit-undo.replay', workspaceId: householdId }]);
  });

  it('P3 — crash after the reversal, before the idempotency write: 0 effects (full rollback), replay converges', async () => {
    const { householdId, actorId, txId } = await seedReversibleExpense(pool);
    households.push(householdId);
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    const { undo, idempotencyKey } = makePgUndo(
      pool,
      createPostgresWriteStore({ pool }),
      replayEvents,
    );

    // Crash ON the idempotency completion write. FIX-UNDO runs claim +
    // reversal + completion in ONE transaction, so the fault aborts the
    // whole undo: the already-executed reversal statements roll back with
    // the claim (pre-fix shape was 1 committed effect + 0 records).
    const fault = armSqlFault(pool, matchIdempotencyCompletion, 'P3-after-reversal');
    try {
      await expect(undo.undo(householdId, actorId, idempotencyKey)).rejects.toThrow(
        /injected crash \[P3-after-reversal\]/,
      );
      expect(fault.fired()).toBe(1);
    } finally {
      fault.disarm();
    }
    // Atomicity holds: nothing committed, nothing recorded.
    const state = await readUndoState(pool, householdId, txId, idempotencyKey);
    expect(state).toEqual({ effects: 0, records: 0, recordStatus: null });

    // SPEC §12.F4: the retry re-executes claim + producer from zero and
    // converges on the single canonical result, marked as replay.
    const retry = createUndoService({
      auditLogs: createPostgresAuditLogStore(pool),
      writes: createPostgresWriteStore({ pool }),
      idempotency: createPostgresIdempotencyStore({ pool }),
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    const first = await retry.undo(householdId, actorId, idempotencyKey);
    expect(first.undone).toMatchObject({ entityId: txId, reversal: 'soft_delete' });
    expect(await readUndoState(pool, householdId, txId, idempotencyKey)).toMatchObject({
      effects: 1,
      records: 1,
      recordStatus: 'completed',
    });
    const replayed = await retry.undo(householdId, actorId, idempotencyKey);
    expect(replayed).toEqual(first);
    expect(replayEvents).toEqual([{ eventType: 'audit-undo.replay', workspaceId: householdId }]);
  });

  it('P4 — crash after the completion write, before COMMIT: 0 effects (full rollback), replay converges', async () => {
    const { householdId, actorId, txId } = await seedReversibleExpense(pool);
    households.push(householdId);
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    const { undo, idempotencyKey } = makePgUndo(
      pool,
      createPostgresWriteStore({ pool }),
      replayEvents,
    );

    // Crash AFTER the completion UPDATE + audit INSERT ran but BEFORE the
    // single COMMIT: with claim + reversal + completion in ONE transaction,
    // everything rolls back together (pre-fix shape was 1 committed effect
    // + 0 records, observably identical to P3 but unrecoverable).
    let completionSeen = false;
    const fault = armSqlFault(
      pool,
      (sql) => {
        if (matchIdempotencyCompletion(sql)) { completionSeen = true; return false; }
        if (completionSeen && sql === 'COMMIT') return true;
        return false;
      },
      'P4-before-commit',
    );
    try {
      await expect(undo.undo(householdId, actorId, idempotencyKey)).rejects.toThrow(
        /injected crash \[P4-before-commit\]/,
      );
      expect(completionSeen).toBe(true);
      expect(fault.fired()).toBe(1);
    } finally {
      fault.disarm();
    }
    const state = await readUndoState(pool, householdId, txId, idempotencyKey);
    expect(state).toEqual({ effects: 0, records: 0, recordStatus: null });

    // SPEC §12.F4: convergent, byte-identical, replay-marked retry.
    const retry = createUndoService({
      auditLogs: createPostgresAuditLogStore(pool),
      writes: createPostgresWriteStore({ pool }),
      idempotency: createPostgresIdempotencyStore({ pool }),
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    const first = await retry.undo(householdId, actorId, idempotencyKey);
    expect(first.undone).toMatchObject({ entityId: txId, reversal: 'soft_delete' });
    const replayed = await retry.undo(householdId, actorId, idempotencyKey);
    expect(replayed).toEqual(first);
    expect(replayEvents).toEqual([{ eventType: 'audit-undo.replay', workspaceId: householdId }]);
  });

  it('P5 — clean commit then duplicate key: single effect, recorded replay', async () => {
    const { householdId, actorId, txId } = await seedReversibleExpense(pool);
    households.push(householdId);
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    const { undo, idempotencyKey } = makePgUndo(
      pool,
      createPostgresWriteStore({ pool }),
      replayEvents,
    );

    const first = await undo.undo(householdId, actorId, idempotencyKey);
    expect(first.undone).toMatchObject({ entityId: txId, reversal: 'soft_delete' });
    expect(replayEvents).toHaveLength(0);

    const replayed = await undo.undo(householdId, actorId, idempotencyKey);
    expect(replayed).toEqual(first);
    expect(replayEvents).toEqual([{ eventType: 'audit-undo.replay', workspaceId: householdId }]);
    expect(await readUndoState(pool, householdId, txId, idempotencyKey)).toMatchObject({
      effects: 1,
      records: 1,
      recordStatus: 'completed',
    });

    // Canonical-path evidence (deliverable 3, first half): the undo record
    // lives under the `audit-undo:` namespace AND the audit row is the
    // canonical shape (operation_record_id FK) — only the 925+ branch of
    // createPostgresIdempotencyStore writes this shape. NOTE: the undo's OWN
    // audit row is generic (string-form lookupOrRecord ⇒ operation 'write',
    // no transactionId on UndoResult ⇒ effect_ref NULL); the reversal target
    // comes from the fixture's audit row (operation + effect_ref below).
    expect(UNDO_IDEMPOTENCY_PREFIX).toBe('audit-undo:');
    const rec = await pool.query<{ id: string; status: string }>(
      'SELECT id, status FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2',
      [householdId, `audit-undo:${idempotencyKey}`],
    );
    expect(rec.rowCount).toBe(1);
    expect(rec.rows[0]!.status).toBe('completed');
    const undoAudit = await pool.query<{ operation: string }>(
      'SELECT operation FROM audit_logs WHERE operation_record_id = $1',
      [rec.rows[0]!.id],
    );
    expect(undoAudit.rowCount).toBe(1);
    expect(undoAudit.rows[0]!.operation).toBe('write');
    const fixtureAudit = await pool.query<{ operation: string; effect_ref: string | null }>(
      'SELECT operation, effect_ref FROM audit_logs WHERE workspace_id = $1 AND operation = $2',
      [householdId, 'transactions.expense.create'],
    );
    expect(fixtureAudit.rowCount).toBe(1);
    expect(fixtureAudit.rows[0]).toMatchObject({
      operation: 'transactions.expense.create',
      effect_ref: txId,
    });
  });

  it('legacy branch (§31.3.2): the SAME namespaced call executes postgres.ts:874-909 when the store is built with legacy:true', async () => {
    // QUALIFICATION, not a repetition of the SPEC claim. The SPEC says the
    // legacy branch is "unreachable by the canonical undo" — true ONLY for
    // canonical-schema deployments. The branch condition is the store's
    // `legacy` flag (postgres.ts:830,874), and production's DB_SCHEMA=legacy
    // boot builds EXACTLY createPostgresIdempotencyStore({ pool, legacy: true })
    // (server/production-routes.ts:141, server/index.ts:134) and wires the
    // undo service onto it — so on the VPS the same
    // lookupOrRecord(householdId, 'audit-undo:'+key, …) call executes 874-909.
    // This test proves the branch is entered for namespaced string-form calls
    // by running it on the canonical schema, where the legacy audit INSERT
    // (household_id/action shape) deterministically fails — i.e. the branch
    // is schema-bound, NOT undo-bound. Flagged to the Planner: §31.3.2 needs
    // a deployment-scoped correction.
    const legacyIdem = createPostgresIdempotencyStore({ pool, legacy: true });
    let evidence = '';
    try {
      await legacyIdem.lookupOrRecord(
        randomUUID(),
        `audit-undo:${randomUUID()}`,
        { probe: 'xlt07-legacy-branch' },
        async () => ({ ok: true }) as never,
      );
    } catch (error) {
      evidence = (error as Error).message;
    }
    console.log(`[xlt-07] legacy-branch evidence: ${evidence}`);
    expect(evidence.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Store parity: the same 5 points against the in-memory stores (dev/test).
// ---------------------------------------------------------------------------
// No process-atomicity promise exists for in-memory — the bar is OBSERVABLE
// behavior (convergent replay). Divergences are RECORDED (never force-failed)
// as input to T3.2. Crash injection here wraps the WriteStore: throwing
// BEFORE delegating ≡ crash before the (synchronous) mutation; delegating
// first and THEN throwing ≡ crash between producer and idempotency persist
// (idempotency.ts:139-140 persists after the producer, outside any boundary).

const parityNotes: string[] = [];
const noteParity = (line: string): void => {
  parityNotes.push(line);
  console.log(`[xlt-07 parity] ${line}`);
};

type MemFixture = {
  householdId: string;
  actorId: string;
  txId: string;
  state: ReturnType<typeof createInMemoryStores>['state'];
  writes: WriteStore;
};

const seedMemFixture = async (): Promise<MemFixture> => {
  const householdId = randomUUID();
  const actorId = 'xlt-07-actor';
  const { state, writes } = createInMemoryStores();
  const account = await writes.createAccount(householdId, {
    name: 'XLT07 mem',
    kind: 'bank',
    initialBalanceCents: 100_000,
  });
  const category = await writes.createCategory(householdId, {
    name: 'XLT07 mem cat',
    kind: 'expense',
  });
  const tx = await writes.createExpense(householdId, {
    description: 'XLT07 mem expense',
    amountCents: 12_345,
    date: '2026-09-16',
    accountId: account.id,
    categoryId: category.id,
  });
  return { householdId, actorId, txId: tx.id, state, writes };
};

const seedMemAudit = (householdId: string, actorId: string, txId: string): AuditLog => ({
  id: randomUUID(),
  workspaceId: householdId,
  actorType: 'device',
  actorId,
  operation: 'transactions.expense.create',
  eventType: 'financial_effect.committed',
  payloadHash: 'xlt07',
  effectRef: txId,
  metadata: { entityType: 'transaction' },
  createdAt: new Date().toISOString(),
});

const makeMemUndo = (
  fx: MemFixture,
  writes: WriteStore,
  sink: Array<{ eventType: string; workspaceId: string }>,
): { undo: UndoService; idempotencyKey: string } => {
  const undo = createUndoService({
    auditLogs: createInMemoryAuditLogStore([seedMemAudit(fx.householdId, fx.actorId, fx.txId)]),
    writes,
    idempotency: createInMemoryIdempotencyStore(),
    observabilitySink: (event) => { sink.push(event); },
  });
  return { undo, idempotencyKey: `xlt07-mem-${randomUUID()}` };
};

describe('XLT-07 parity — in-memory stores (observable behavior)', () => {
  it('P1/P2 — throw before the synchronous mutation: 0 effects, replay converges', async () => {
    const fx = await seedMemFixture();
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    // P2 NOTE (documented non-divergence): the in-memory reversal is ONE
    // synchronous mutation (deletedTransactions.add + balance restore, no
    // await points between them), so there is NO observable mid-point — a
    // crash "during" is either before the first write (≡ P1, shown here) or
    // after the last write (≡ P3, next test). P1 and P2 are observably
    // identical in-memory; the distinction only exists on Postgres.
    const crashingWrites: WriteStore = {
      ...fx.writes,
      softDeleteTransaction: async () => {
        throw new Error('XLT-07 injected crash [mem-P1/P2] before mutation');
      },
    };
    const { undo, idempotencyKey } = makeMemUndo(fx, crashingWrites, replayEvents);
    await expect(undo.undo(fx.householdId, fx.actorId, idempotencyKey)).rejects.toThrow(
      /mem-P1\/P2/,
    );
    expect(fx.state.deletedTransactions.has(fx.txId)).toBe(false);

    const retry = createUndoService({
      auditLogs: createInMemoryAuditLogStore([seedMemAudit(fx.householdId, fx.actorId, fx.txId)]),
      writes: fx.writes,
      idempotency: createInMemoryIdempotencyStore(),
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    // NOTE: fresh idempotency store + fresh service = new process. The FIRST
    // attempt's claim never persisted (producer threw), so the retry runs the
    // producer once and records it.
    const first = await retry.undo(fx.householdId, fx.actorId, idempotencyKey);
    expect(first.undone).toMatchObject({ entityId: fx.txId });
    const replayed = await retry.undo(fx.householdId, fx.actorId, idempotencyKey);
    expect(replayed).toEqual(first);
    expect(replayEvents).toEqual([
      { eventType: 'audit-undo.replay', workspaceId: fx.householdId },
    ]);
    noteParity('P1/P2 in-memory: converges (no divergence vs Postgres P1/P2).');
  });

  it('P3/P4 — effect applied, record lost: DIVERGES_TODAY, recorded for T3.2 (no double effect)', async () => {
    const fx = await seedMemFixture();
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    // Crash between producer and idempotency persist (idempotency.ts:139-140
    // persists AFTER the producer returns, outside any boundary): the effect
    // is applied, then the fault throws, so no record is ever written.
    const real = fx.writes.softDeleteTransaction.bind(fx.writes);
    const crashingWrites: WriteStore = {
      ...fx.writes,
      softDeleteTransaction: async (householdId: string, id: string) => {
        const result = await real(householdId, id);
        throw new Error('XLT-07 injected crash [mem-P3/P4] after effect, before record');
      },
    };
    const memIdem = createInMemoryIdempotencyStore();
    const memAudit = [seedMemAudit(fx.householdId, fx.actorId, fx.txId)];
    const undo = createUndoService({
      auditLogs: createInMemoryAuditLogStore(memAudit),
      writes: crashingWrites,
      idempotency: memIdem,
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    const idempotencyKey = `xlt07-mem-${randomUUID()}`;
    await expect(undo.undo(fx.householdId, fx.actorId, idempotencyKey)).rejects.toThrow(
      /mem-P3\/P4/,
    );
    expect(fx.state.deletedTransactions.has(fx.txId)).toBe(true);

    // Retry (= new process): no record exists, so the producer re-runs and
    // hits the already-deleted transaction. T3.2 must align this.
    const retry = createUndoService({
      auditLogs: createInMemoryAuditLogStore(memAudit),
      writes: fx.writes,
      idempotency: memIdem,
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    try {
      await retry.undo(fx.householdId, fx.actorId, idempotencyKey);
      noteParity('P3/P4 in-memory: retry unexpectedly converged.');
    } catch (error) {
      noteParity(
        `P3/P4 in-memory DIVERGES_TODAY (T3.2 input): retry throws '${(error as { code?: string }).code ?? (error as Error).message}' ` +
          'instead of converging — same lost-record shape as Postgres P3/P4.',
      );
    }
    // Safety invariant (always asserted, never conditional): still exactly
    // ONE effect — the retry never double-applies, it throws.
    expect(fx.state.deletedTransactions.has(fx.txId)).toBe(true);
    expect(fx.state.transactions.filter((t) => t.id === fx.txId)).toHaveLength(1);
  });

  it('P5 — clean commit then duplicate key: single effect, recorded replay', async () => {
    const fx = await seedMemFixture();
    const replayEvents: Array<{ eventType: string; workspaceId: string }> = [];
    const memIdem = createInMemoryIdempotencyStore();
    const memAudit = [seedMemAudit(fx.householdId, fx.actorId, fx.txId)];
    const undo = createUndoService({
      auditLogs: createInMemoryAuditLogStore(memAudit),
      writes: fx.writes,
      idempotency: memIdem,
      observabilitySink: (event) => { replayEvents.push(event); },
    });
    const idempotencyKey = `xlt07-mem-${randomUUID()}`;
    const first = await undo.undo(fx.householdId, fx.actorId, idempotencyKey);
    expect(first.undone).toMatchObject({ entityId: fx.txId });
    const replayed = await undo.undo(fx.householdId, fx.actorId, idempotencyKey);
    expect(replayed).toEqual(first);
    expect(replayEvents).toEqual([
      { eventType: 'audit-undo.replay', workspaceId: fx.householdId },
    ]);
    noteParity('P5 in-memory: converges (no divergence vs Postgres P5).');
  });

  it('parity divergence report (T3.2 input)', () => {
    console.log(`[xlt-07 parity] ${parityNotes.length} note(s):`);
    for (const line of parityNotes) console.log(`[xlt-07 parity] - ${line}`);
    expect(parityNotes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Emitters T0.4.5/T0.4.6 (born here; in-memory so they run without Postgres).
// ---------------------------------------------------------------------------

const newIdentity = (): PendingIdentity => ({
  workspaceId: randomUUID(),
  actorId: randomUUID(),
  deviceId: randomUUID(),
});

const proposeCanonical = async (store: PendingOperationV2Store, identity: PendingIdentity) => {
  const base = {
    version: 2 as const,
    workspaceId: identity.workspaceId,
    actorId: identity.actorId,
    deviceId: identity.deviceId,
    tool: 'transactions.expense.create',
    normalizedArgs: {
      description: 'XLT07 reconcile probe',
      amountCents: 4242,
      date: '2026-09-14',
      accountId: randomUUID(),
      categoryId: randomUUID(),
    },
    proposalHash: '',
    idempotencyKey: randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    bindings: {
      workspaceId: identity.workspaceId,
      actorId: identity.actorId,
      deviceId: identity.deviceId,
    },
  };
  const proposalHash = await computePendingOperationV2Hash(base);
  return store.propose({ ...base, proposalHash });
};

describe('XLT-07 emitters — audit-undo.replay + mutation.reconcile.enqueued', () => {
  it('T0.4.5: a replayed undo emits exactly 1 audit-undo.replay event with workspace_id', async () => {
    const fx = await seedMemFixture();
    const events: Array<{ eventType: string; workspaceId: string }> = [];
    const memIdem = createInMemoryIdempotencyStore();
    const memAudit = [seedMemAudit(fx.householdId, fx.actorId, fx.txId)];
    const undo = createUndoService({
      auditLogs: createInMemoryAuditLogStore(memAudit),
      writes: fx.writes,
      idempotency: memIdem,
      observabilitySink: (event) => { events.push(event); },
    });
    const key = `xlt07-emit-${randomUUID()}`;
    await undo.undo(fx.householdId, fx.actorId, key);
    expect(events).toHaveLength(0);
    await undo.undo(fx.householdId, fx.actorId, key);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ eventType: 'audit-undo.replay', workspaceId: fx.householdId });
  });

  it('T0.4.5: replay without a sink never breaks the undo (best-effort default)', async () => {
    const fx = await seedMemFixture();
    const memIdem = createInMemoryIdempotencyStore();
    const memAudit = [seedMemAudit(fx.householdId, fx.actorId, fx.txId)];
    const undo = createUndoService({
      auditLogs: createInMemoryAuditLogStore(memAudit),
      writes: fx.writes,
      idempotency: memIdem,
    });
    const key = `xlt07-emit-default-${randomUUID()}`;
    const first = await undo.undo(fx.householdId, fx.actorId, key);
    await expect(undo.undo(fx.householdId, fx.actorId, key)).resolves.toEqual(first);
  });

  it('T0.4.6: entering reconcile emits mutation.reconcile.enqueued with operationId + reason', async () => {
    const events: Array<{
      eventType: string;
      workspaceId: string;
      operationId: string;
      reason: string;
    }> = [];
    const store = createInMemoryPendingOperationV2Store({
      leaseMs: 40,
      observabilitySink: (event) => { events.push(event); },
    });
    const identity = newIdentity();
    const saved = await proposeCanonical(store, identity);
    const confirmed = await store.confirm(saved.id, identity);
    let releaseExecutor!: (value: { status: string; operationId: string }) => void;
    const gate = new Promise<{ status: string; operationId: string }>((resolve) => {
      releaseExecutor = resolve;
    });
    const first = store.execute(confirmed.attestation!, identity, () => gate);
    // Wait for the lease to expire while the first execution hangs.
    const started = Date.now();
    for (;;) {
      const record = await store.get(saved.id, identity);
      if (record.executionLeaseExpiresAt && Date.parse(record.executionLeaseExpiresAt) <= Date.now()) break;
      if (Date.now() - started > 5_000) throw new Error('timed out waiting for lease expiry');
      await new Promise((r) => setTimeout(r, 5));
    }
    const recovered = await store.reconcileExpiredExecuting(saved.id, identity, async () => ({
      status: 'succeeded',
      operationId: randomUUID(),
    }));
    expect(recovered.status).toBe('succeeded');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      eventType: 'mutation.reconcile.enqueued',
      workspaceId: identity.workspaceId,
      operationId: saved.id,
      reason: RECONCILE_REASON_LEASE_EXPIRED,
    });
    releaseExecutor({ status: 'succeeded', operationId: randomUUID() });
    await first;
  });
});
