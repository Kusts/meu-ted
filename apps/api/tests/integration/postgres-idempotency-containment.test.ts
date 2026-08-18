/**
 * Postgres idempotency containment — gated by DATABASE_URL_TEST.
 *
 * The test database must already contain public._test_marker with the UUID in
 * DB_TEST_MARKER. The guard runs before migrations or cleanup.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';
import { createPostgresIdempotencyStore, createPostgresWriteStore } from '../../src/writes/postgres.js';
import { createPostgresAuditLogStore } from '../../src/audit/store.js';
import { buildIdempotencyKey, createIdempotencyRequest, hashIdempotencyPayload } from '../../src/writes/idempotency.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const TEST_HOUSEHOLD = '00000000-0000-4000-8000-0000000000f1';
const describeIfDb = DB_URL ? describe : describe.skip;
describeIfDb('0.4.1 — Postgres concurrent idempotency', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool({ connectionString: DB_URL!, max: 8 });
    await runMigrations(pool);
  }, 30_000);

  afterAll(async () => {
    await pool?.end();
  });

  it('four concurrent requests with one key execute one producer effect', async () => {
    await requireTestDatabase(pool, 'postgres-idempotency-test cleanup');
    const key = `postgres-concurrency-${Date.now()}-${Math.random()}`;
    const idempotency = createPostgresIdempotencyStore({ pool });
    const request = createIdempotencyRequest(
      { householdId: TEST_HOUSEHOLD, deviceId: 'device-test' },
      'transactions.expense.create',
      key,
    );
    let effectCount = 0;
    let createdAccountId: string | undefined;
    const writes = createPostgresWriteStore({ pool });

    try {
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          idempotency.lookupOrRecord(
            request,
            { operation: 'create-expense', amountCents: 5000 },
            async () => {
              effectCount += 1;
              const account = await writes.createAccount(TEST_HOUSEHOLD, {
                name: `Atomic effect ${key}`,
                kind: 'bank',
                initialBalanceCents: 100,
              });
              createdAccountId = account.id;
              await new Promise((resolve) => setTimeout(resolve, 50));
              return { transactionId: account.id };
            },
          ),
        ),
      );

      expect(effectCount).toBe(1);
      expect(new Set(results.map((result) => result.response.transactionId))).toHaveLength(1);
      expect(results.filter((result) => !result.replayed)).toHaveLength(1);
      expect(results.filter((result) => result.replayed)).toHaveLength(3);

      const operationRecords = await pool.query<{
        status: string;
        actor_type: string;
        actor_id: string;
        response: { transactionId: string };
        created_at: Date;
        lease_until: Date;
        retry_until: Date;
        retention_until: Date;
      }>(
        `SELECT status, actor_type, actor_id, response, created_at, lease_until, retry_until, retention_until
           FROM operation_records
          WHERE workspace_id = $1 AND idempotency_key = $2`,
        [TEST_HOUSEHOLD, buildIdempotencyKey(request)],
      );
      expect(operationRecords.rows).toHaveLength(1);
      expect(operationRecords.rows[0]!.status).toBe('completed');
      expect(operationRecords.rows[0]!.actor_type).toBe('device');
      expect(operationRecords.rows[0]!.actor_id).toBe('device-test');
      expect(operationRecords.rows[0]!.response.transactionId).toBe(createdAccountId);
      const lifecycle = operationRecords.rows[0]!;
      expect(lifecycle.lease_until.getTime() - lifecycle.created_at.getTime()).toBeCloseTo(5 * 60 * 1000, -3);
      expect(lifecycle.retry_until.getTime() - lifecycle.created_at.getTime()).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
      expect(lifecycle.retention_until.getTime() - lifecycle.created_at.getTime()).toBeCloseTo(90 * 24 * 60 * 60 * 1000, -3);

      const auditRecords = await pool.query(
        `SELECT event_type, actor_type, actor_id, workspace_id, effect_ref, metadata
           FROM audit_logs
          WHERE operation_record_id = (
            SELECT id FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2
          )`,
        [TEST_HOUSEHOLD, buildIdempotencyKey(request)],
      );
      expect(auditRecords.rows).toHaveLength(1);
      expect(auditRecords.rows[0]!.event_type).toBe('financial_effect.committed');
      expect(auditRecords.rows[0]!.actor_type).toBe('device');
      expect(auditRecords.rows[0]!.actor_id).toBe('device-test');
      expect(auditRecords.rows[0]!.workspace_id).toBe(TEST_HOUSEHOLD);
      const effectId = createdAccountId!;
      expect(auditRecords.rows[0]!.effect_ref).toBe(effectId);
      expect(auditRecords.rows[0]!.metadata).toMatchObject({ entityType: 'transaction' });
      if (process.env.PRINT_G2_GATE_AUDIT === '1') {
        console.log('G2_GATE_CONCURRENCY', JSON.stringify({ requests: 4, producerEffects: effectCount, replays: results.filter((result) => result.replayed).length, operationRecords: operationRecords.rows.length, auditRecords: auditRecords.rows.length }));
      }
      const auditStore = createPostgresAuditLogStore(pool);
      const listed = await auditStore.listAuditLogs(TEST_HOUSEHOLD, { operation: 'transactions.expense.create', actorType: 'device', entityType: 'transaction', entityId: effectId, limit: 10 });
      expect(listed).toMatchObject({ total: 1, items: [{ id: expect.any(String), workspaceId: TEST_HOUSEHOLD, actorType: 'device', operation: 'transactions.expense.create', effectRef: effectId }] });
      const nonmatching = await auditStore.listAuditLogs(TEST_HOUSEHOLD, { entityType: 'category', entityId: effectId, limit: 10 });
      expect(nonmatching).toEqual({ total: 0, items: [] });
      if (process.env.PRINT_G0_AUDIT === '1') {
        console.log('G0-AUDIT-QUERY', JSON.stringify({ operationRecords: operationRecords.rows, auditRecords: auditRecords.rows }));
      }
    } finally {
      await requireTestDatabase(pool, 'postgres-idempotency-test cleanup');
      await pool.query(
        'DELETE FROM audit_logs WHERE operation_record_id IN (SELECT id FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2)',
        [TEST_HOUSEHOLD, buildIdempotencyKey(request)],
      );
      await pool.query(
        'DELETE FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2',
        [TEST_HOUSEHOLD, buildIdempotencyKey(request)],
      );
      if (createdAccountId) {
        await pool.query('DELETE FROM accounts WHERE id = $1', [createdAccountId]);
      }
    }
  }, 30_000);

  it('rolls back claim, financial effect and audit together on producer failure', async () => {
    await requireTestDatabase(pool, 'postgres-idempotency-rollback cleanup');
    const key = `postgres-rollback-${Date.now()}-${Math.random()}`;
    const idempotency = createPostgresIdempotencyStore({ pool });
    const request = createIdempotencyRequest(
      { householdId: TEST_HOUSEHOLD, deviceId: 'device-test' },
      'accounts.create',
      key,
    );
    const writes = createPostgresWriteStore({ pool });
    const name = `Rollback effect ${key}`;

    await expect(
      idempotency.lookupOrRecord(request, { name }, async () => {
        await writes.createAccount(TEST_HOUSEHOLD, {
          name,
          kind: 'bank',
          initialBalanceCents: 100,
        });
        throw new Error('producer failed');
      }),
    ).rejects.toThrow('producer failed');

    const accounts = await pool.query('SELECT id FROM accounts WHERE household_id = $1 AND name = $2', [TEST_HOUSEHOLD, name]);
    expect(accounts.rows).toHaveLength(0);
    const records = await pool.query('SELECT id FROM operation_records WHERE workspace_id = $1 AND idempotency_key = $2', [TEST_HOUSEHOLD, buildIdempotencyKey(request)]);
    expect(records.rows).toHaveLength(0);
    const audits = await pool.query('SELECT id FROM audit_logs WHERE workspace_id = $1 AND payload_hash = $2', [TEST_HOUSEHOLD, hashIdempotencyPayload({ name })]);
    expect(audits.rows).toHaveLength(0);
    if (process.env.PRINT_G2_GATE_AUDIT === '1') {
      console.log('G2_GATE_PRODUCER_ROLLBACK', JSON.stringify({ accounts: accounts.rows.length, operationRecords: records.rows.length, auditLogs: audits.rows.length }));
    }
  }, 30_000);
});
