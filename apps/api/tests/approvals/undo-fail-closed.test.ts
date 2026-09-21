/**
 * V4.1 Phase 4 (fail-closed atomicity) — undo applyReversal RED.
 *
 * applyReversal has 3 reversal branches (transaction soft-delete, account
 * deactivate, category deactivate). When the idempotency layer invokes the
 * producer with an open claim transaction but the write store exposes no
 * `*InTx` extension for the required branch, the reversal MUST throw
 * `idempotency.atomic_mutation_not_supported` — never run the plain method
 * outside the claim transaction (that would commit the effect without the
 * claim + completion and silently lose atomicity).
 */
import { describe, expect, it, vi } from 'vitest';
import { createInMemoryAuditLogStore, type AuditLog } from '../../src/audit/store.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import type { IdempotencyStore } from '../../src/writes/idempotency.js';
import { createUndoService } from '../../src/approvals/undo.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

const fakeTx = { query: async () => ({ rows: [], rowCount: 0 }) };

/** Idempotency store that hands the producer an open claim tx (Postgres path). */
const txClaimStore = (): IdempotencyStore => ({
  lookupOrRecord: (async (_householdId: string, _key: string, _payload: unknown, producer?: unknown) => {
    const response = await (producer as (tx?: unknown) => Promise<unknown>)(fakeTx);
    return { response, replayed: false };
  }) as IdempotencyStore['lookupOrRecord'],
});

const auditLogFor = (operation: string, entityId: string): AuditLog => ({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  workspaceId: HOUSEHOLD_A,
  actorType: 'device',
  actorId: 'dev-device-1',
  operation,
  eventType: 'financial_effect.committed',
  payloadHash: 'hash',
  effectRef: entityId,
  metadata: { entityId },
  createdAt: '2026-06-10T12:00:00.000Z',
});

describe('Phase 4 — undo applyReversal is fail-closed without InTx', () => {
  it.each([
    ['transactions.expense.create', 'softDeleteTransaction'],
    ['accounts.create', 'deactivateAccount'],
    ['categories.create', 'deactivateCategory'],
  ])('%s with claimTx but no InTx → invariant error, plain reversal never runs', async (operation, plainMethod) => {
    const { writes: raw } = createInMemoryStores();
    const writes = {
      ...raw,
      [plainMethod]: vi.fn(async () => {
        throw new Error('plain reversal must not run outside the claim tx');
      }),
    };
    const auditLogs = createInMemoryAuditLogStore([auditLogFor(operation, 'entity-1')]);
    const svc = createUndoService({ auditLogs, writes, idempotency: txClaimStore() });
    await expect(svc.undo(HOUSEHOLD_A, 'dev-device-1', `undo-fail-closed-${plainMethod}`)).rejects.toMatchObject({
      code: 'idempotency.atomic_mutation_not_supported',
    });
    expect(writes[plainMethod as keyof typeof writes] as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});
