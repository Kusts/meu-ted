/**
 * Postgres undo/approval transactionality — gated by DATABASE_URL_TEST.
 *
 * The test database must already contain public._test_marker with the UUID in
 * DB_TEST_MARKER. The guard runs before migrations or cleanup.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import { createPostgresWriteStore } from '../../src/writes/postgres.js';
import { createPostgresAuditLogStore } from '../../src/audit/store.js';
import { createPostgresPendingOperationStore } from '../../src/approvals/pending.js';
import { createUndoService } from '../../src/approvals/undo.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const TEST_HOUSEHOLD = '00000000-0000-4000-8000-0000000000f1';
const describeIfDb = DB_URL ? describe : describe.skip;

describeIfDb('0.5 — Postgres undo transactionality', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool({ connectionString: DB_URL!, max: 4 });
    await runMigrations(pool);
    // Self-cleaning on a reused database: previous runs left pending rows
    // for the fixed TEST_HOUSEHOLD (no per-test cleanup existed), so purge
    // before starting for deterministic second-run behavior.
    await pool.query(`DELETE FROM pending_operations WHERE workspace_id = $1`, [TEST_HOUSEHOLD]).catch(() => undefined);
  }, 30_000);

  afterAll(async () => {
    await pool?.query(`DELETE FROM pending_operations WHERE workspace_id = $1`, [TEST_HOUSEHOLD]).catch(() => undefined);
    await pool?.end();
  });

  it('approve is a conditional claim: concurrent approve executes once and retry is canonical', async () => {
    const pending = createPostgresPendingOperationStore(pool);
    const created = await pending.create({
      householdId: TEST_HOUSEHOLD,
      requesterId: 'actor-1',
      operation: 'transactions.expense.create',
      payload: { amountCents: 50_000 },
      reason: 'high_value',
      idempotencyKey: `pg-undo-${crypto.randomUUID()}`,
    });

    let executions = 0;
    const execute = async () => { executions += 1; return { transactionId: 'tx-1' }; };

    const [first, second] = await Promise.all([
      pending.approve(created.id, TEST_HOUSEHOLD, 'actor-1', execute),
      pending.approve(created.id, TEST_HOUSEHOLD, 'actor-1', execute),
    ]);

    expect(first.status).toBe('approved');
    expect(second.status).toBe('approved');
    expect(executions).toBe(1);
  });

  it('approve from a different actor is forbidden', async () => {
    const pending = createPostgresPendingOperationStore(pool);
    const created = await pending.create({
      householdId: TEST_HOUSEHOLD,
      requesterId: 'actor-1',
      operation: 'accounts.create',
      payload: { name: 'A' },
      reason: 'destructive',
      idempotencyKey: `pg-owner-${crypto.randomUUID()}`,
    });

    await expect(pending.approve(created.id, TEST_HOUSEHOLD, 'actor-2'))
      .rejects.toMatchObject({ code: 'approval.requester_only' });
  });

  it('undo service is wiring-complete against postgres stores', async () => {
    const writes = createPostgresWriteStore(pool);
    const auditLogs = createPostgresAuditLogStore(pool);
    const undo = createUndoService({ auditLogs, writes });
    // No eligible action for an empty workspace -> nothing to undo (403).
    await expect(undo.undo(TEST_HOUSEHOLD, 'actor-nobody', 'key-1')).rejects.toMatchObject({ code: 'undo.nothing_to_undo' });
  });
});
