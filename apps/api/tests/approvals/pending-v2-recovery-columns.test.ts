/**
 * T2.1 — V052 execution-recovery columns (SPEC §12).
 *
 * - Record shape: both stores expose attestationIssuedAt /
 *   executionClaimedAt / executionLeaseExpiresAt / executionAttemptCount /
 *   failureCode / mutationId with sane fresh defaults (nulls / attempt 0).
 *   No claim/lease behavior is asserted here (T2.3/T2.4 own that).
 * - Migration integrity: V052 file exists, is additive-only, and is
 *   registered in the migration manifest sequenced after V051.
 *
 * The Postgres half runs only when DATABASE_URL_TEST is set (gate copied
 * from pending-v2-postgres-red.test.ts); otherwise it is skipped loudly.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { computePendingOperationV2Hash } from '@pi-finance/llm-contracts';
import {
  createInMemoryPendingOperationV2Store,
  createPostgresPendingOperationV2Store,
  type PendingIdentity,
  type PendingOperationV2Store,
} from '../../src/approvals/pending-v2.js';
import {
  expectedMigrationManifest,
  LEGACY_SAFE_PREFIXES,
} from '../../src/read-models/sql/migrate.js';
import { createPool } from '../../src/db/pool.js';
import { requireTestDatabase } from '../../src/db/db-guard.js';

const here = dirname(fileURLToPath(import.meta.url));
const V052_PATH = join(here, '..', '..', 'src', 'read-models', 'sql', 'V052__pending_operation_execution_recovery.sql');

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
      description: 'Recovery columns probe',
      amountCents: 500,
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

const expectFreshRecoveryShape = (record: Record<string, unknown>, label: string): void => {
  expect(record.executionAttemptCount, `${label}: executionAttemptCount`).toBe(0);
  expect(record.attestationIssuedAt, `${label}: attestationIssuedAt`).toBeUndefined();
  expect(record.executionClaimedAt, `${label}: executionClaimedAt`).toBeUndefined();
  expect(record.executionLeaseExpiresAt, `${label}: executionLeaseExpiresAt`).toBeUndefined();
  expect(record.failureCode, `${label}: failureCode`).toBeUndefined();
  expect(record.mutationId, `${label}: mutationId`).toBeUndefined();
};

describe('pending-v2 recovery columns (in-memory)', () => {
  it('fresh proposal exposes V052 recovery fields with sane defaults', async () => {
    const store = createInMemoryPendingOperationV2Store();
    const identity = newIdentity();
    const saved = await proposeCanonical(store, identity);
    expectFreshRecoveryShape(saved as unknown as Record<string, unknown>, 'propose');
    const fetched = await store.get(saved.id, identity);
    expectFreshRecoveryShape(fetched as unknown as Record<string, unknown>, 'get');
    const confirmed = await store.confirm(saved.id, identity);
    expect(confirmed.executionAttemptCount).toBe(0);
    expect(confirmed.mutationId).toBeUndefined();
  });
});

const DB_URL = process.env.DATABASE_URL_TEST;

if (!DB_URL) {
  console.log(
    '[pending-v2-recovery-columns] SKIP: DATABASE_URL_TEST is not set — Postgres half skipped. ' +
      'The in-memory half above still covers the recovery shape.',
  );
  describe.skip('pending-v2 recovery columns (postgres)', () => {});
} else {
  describe('pending-v2 recovery columns (postgres)', () => {
    let pool: Pool;
    const workspaces = new Set<string>();

    beforeAll(async () => {
      pool = createPool({ connectionString: DB_URL, max: 4 });
      await requireTestDatabase(pool, 'pending-v2-recovery-columns');
    }, 30_000);

    afterAll(async () => {
      if (workspaces.size > 0) {
        await pool.query('DELETE FROM pending_operations WHERE workspace_id = ANY($1)', [[...workspaces]]);
      }
      await pool.end();
    });

    it('fresh proposal round-trips V052 recovery fields with sane defaults', async () => {
      const store = createPostgresPendingOperationV2Store(pool);
      const identity = newIdentity();
      workspaces.add(identity.workspaceId);
      const saved = await proposeCanonical(store, identity);
      expectFreshRecoveryShape(saved as unknown as Record<string, unknown>, 'propose');
      const fetched = await store.get(saved.id, identity);
      expectFreshRecoveryShape(fetched as unknown as Record<string, unknown>, 'get');
    });
  });
}

describe('V052 migration integrity', () => {
  it('V052 file exists with the required recovery columns and partial index', () => {
    expect(existsSync(V052_PATH), `missing ${V052_PATH}`).toBe(true);
    const sql = readFileSync(V052_PATH, 'utf8');
    for (const column of [
      'attestation_issued_at',
      'execution_claimed_at',
      'execution_lease_expires_at',
      'execution_attempt_count',
      'failure_code',
      'mutation_id',
    ]) {
      expect(sql, `V052 must add ${column}`).toContain(column);
    }
    expect(sql).toContain('execution_status');
    expect(sql).toMatch(/CREATE\s+(UNIQUE\s+)?INDEX/i);
  });

  it('V052 is additive-only (no DROP, no column type rewrite)', () => {
    const sql = readFileSync(V052_PATH, 'utf8');
    expect(sql).not.toMatch(/\bDROP\b/i);
    expect(sql).not.toMatch(/ALTER\s+COLUMN/i);
  });

  it('V052 is registered in the manifest sequenced after V051', () => {
    const manifest = expectedMigrationManifest(false);
    const versions = manifest.map((entry) => entry.version);
    expect(versions).toContain(52);
    expect(versions.indexOf(52)).toBeGreaterThan(versions.indexOf(51));
    const entry = manifest.find((candidate) => candidate.version === 52);
    expect(entry?.name).toBe('V052__pending_operation_execution_recovery.sql');
    expect(LEGACY_SAFE_PREFIXES).toContain('V052');
  });
});
