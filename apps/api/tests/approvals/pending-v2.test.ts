import { describe, expect, it } from 'vitest';
import { computePendingOperationV2Hash, type PendingOperationV2 } from '@pi-finance/llm-contracts';
import {
  createInMemoryPendingOperationV2Store,
  PendingOperationV2Error,
} from '../../src/approvals/pending-v2.js';

const proposal = async (overrides: Partial<PendingOperationV2> = {}): Promise<PendingOperationV2> => {
  const base = {
    version: 2 as const,
    workspaceId: 'workspace-1', actorId: 'actor-1', deviceId: 'device-1',
    tool: 'transactions.expense.create', normalizedArgs: { amountCents: 1250 },
    proposalHash: '', idempotencyKey: 'idem-1',
    createdAt: new Date(Date.now()).toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    bindings: { workspaceId: 'workspace-1', actorId: 'actor-1', deviceId: 'device-1' },
    ...overrides,
  };
  return { ...base, proposalHash: await computePendingOperationV2Hash(base) };
};

describe('authoritative pending operation V2', () => {
  it('rejects wrong device, altered proposal and expired confirmation', async () => {
    const store = createInMemoryPendingOperationV2Store();
    const p = await proposal();
    const saved = await store.propose(p);
    await expect(store.confirm(saved.id, { workspaceId: p.workspaceId, actorId: p.actorId, deviceId: 'other-device' }))
      .rejects.toMatchObject({ code: 'approval.binding_mismatch' });
    const altered = await proposal({ idempotencyKey: 'idem-altered', normalizedArgs: { amountCents: 1251 } });
    altered.proposalHash = p.proposalHash;
    await expect(store.propose(altered))
      .rejects.toMatchObject({ code: 'approval.invalid_hash' });
    const expired = await store.propose(await proposal({ idempotencyKey: 'idem-expired' }));
    expired.expiresAt = new Date(Date.now() - 1).toISOString();
    await expect(store.confirm(expired.id, { workspaceId: p.workspaceId, actorId: p.actorId, deviceId: p.deviceId }))
      .rejects.toMatchObject({ code: 'approval.expired' });
  });

  it('emits opaque one-use attestation and executes at most once, failing closed on incomplete result', async () => {
    const store = createInMemoryPendingOperationV2Store();
    const p = await proposal();
    const saved = await store.propose(p);
    const confirmed = await store.confirm(saved.id, p);
    expect(confirmed.attestation).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const result = await store.execute(confirmed.attestation!, p, async () => ({ status: 'succeeded', operationId: 'op-1' }));
    expect(result.status).toBe('succeeded');
    await expect(store.execute(confirmed.attestation!, p, async () => ({ status: 'succeeded' })))
      .rejects.toMatchObject({ code: 'approval.attestation_replayed' });
    const second = await store.propose(await proposal({ idempotencyKey: 'idem-2' }));
    const secondConfirmed = await store.confirm(second.id, p);
    await expect(store.execute(secondConfirmed.attestation!, p, async () => ({ ok: true })))
      .rejects.toMatchObject({ code: 'approval.incomplete_result' });
  });

  it('deduplicates same idempotency request and supports retry with a new attestation', async () => {
    const store = createInMemoryPendingOperationV2Store();
    const p = await proposal();
    const first = await store.propose(p);
    expect(await store.propose(p)).toMatchObject({ id: first.id });
    const confirmed = await store.confirm(first.id, p);
    const firstAttestation = confirmed.attestation;
    await expect(store.execute(firstAttestation!, p, async () => { throw new Error('temporary'); })).rejects.toThrow('temporary');
    const retried = await store.retry(first.id, p);
    expect(retried.attestation).toBeTruthy();
    expect(retried.attestation).not.toBe(firstAttestation);
    await expect(store.propose(await proposal({ idempotencyKey: p.idempotencyKey, normalizedArgs: { amountCents: 2 } })))
      .rejects.toBeInstanceOf(PendingOperationV2Error);
  });
});
