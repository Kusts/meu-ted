import { describe, expect, it } from 'vitest';
import {
  computePendingOperationV2Hash,
  pendingOperationV2Schema,
  verifyPendingOperationV2Hash,
  type PendingOperationV2,
} from '@pi-finance/llm-contracts';

const baseOperation: PendingOperationV2 = {
  version: 2,
  workspaceId: 'workspace-1',
  actorId: 'actor-1',
  deviceId: 'device-1',
  tool: 'transactions.expense.create',
  normalizedArgs: { amountCents: 1250, categoryId: 'cat-1' },
  proposalHash: '0'.repeat(64),
  idempotencyKey: 'pending-v2-1',
  createdAt: '2026-09-13T12:00:00.000Z',
  expiresAt: '2026-09-13T12:30:00.000Z',
  bindings: { workspaceId: 'workspace-1', actorId: 'actor-1', deviceId: 'device-1' },
};

describe('PendingOperationV2 contract', () => {
  it('requires every approval field and rejects legacy summary/status fields', () => {
    expect(pendingOperationV2Schema.safeParse(baseOperation).success).toBe(true);
    for (const field of ['version', 'workspaceId', 'actorId', 'deviceId', 'tool', 'normalizedArgs', 'proposalHash', 'idempotencyKey', 'createdAt', 'expiresAt', 'bindings']) {
      const candidate = { ...baseOperation } as Record<string, unknown>;
      delete candidate[field];
      expect(pendingOperationV2Schema.safeParse(candidate).success, field).toBe(false);
    }
    expect(pendingOperationV2Schema.safeParse({ ...baseOperation, summary: 'unsafe', status: 'pending' }).success).toBe(false);
  });

  it('requires a non-null device binding and matching identity bindings', () => {
    expect(pendingOperationV2Schema.safeParse({ ...baseOperation, deviceId: null }).success).toBe(false);
    expect(pendingOperationV2Schema.safeParse({ ...baseOperation, bindings: { ...baseOperation.bindings, actorId: 'other-actor' } }).success).toBe(false);
    expect(pendingOperationV2Schema.safeParse({ ...baseOperation, bindings: { ...baseOperation.bindings, deviceId: 'other-device' } }).success).toBe(false);
  });

  it('hashes only canonical tool, args and identity context', async () => {
    const hash = await computePendingOperationV2Hash(baseOperation);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await verifyPendingOperationV2Hash({ ...baseOperation, proposalHash: hash })).toBe(true);
    expect(await verifyPendingOperationV2Hash({ ...baseOperation, proposalHash: hash, idempotencyKey: 'different' })).toBe(true);
    expect(await verifyPendingOperationV2Hash({ ...baseOperation, proposalHash: hash, createdAt: '2026-09-13T12:01:00.000Z' })).toBe(true);
    expect(await verifyPendingOperationV2Hash({ ...baseOperation, proposalHash: hash, normalizedArgs: { ...baseOperation.normalizedArgs, amountCents: 1251 } })).toBe(false);
    expect(await verifyPendingOperationV2Hash({ ...baseOperation, proposalHash: hash, bindings: { ...baseOperation.bindings, deviceId: 'other-device' } })).toBe(false);
  });
});
