import { describe, expect, it } from 'vitest';
import { createInMemoryPendingOperationStore } from '../../src/approvals/pending.js';

const createPending = async (store: ReturnType<typeof createInMemoryPendingOperationStore>, overrides: Record<string, unknown> = {}) =>
  store.create({
    householdId: 'workspace-1',
    requesterId: 'user-1',
    operation: 'transactions.expense.create',
    payload: { description: 'Large', amountCents: 50_000 },
    reason: 'high_value',
    idempotencyKey: 'intent-1',
    ...overrides,
  });

describe('pending adversarial', () => {
  it('concurrent approve/approve executes exactly once and returns canonical result', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await createPending(store);
    let executions = 0;
    const execute = async () => { executions += 1; return { transactionId: 'tx-1' }; };

    const [first, second] = await Promise.all([
      store.approve(pending.id, 'workspace-1', 'user-1', execute),
      store.approve(pending.id, 'workspace-1', 'user-1', execute),
    ]);

    expect(executions).toBe(1);
    expect(first.status).toBe('approved');
    expect(second.status).toBe('approved');
  });

  it('concurrent approve/reject settles with a single winner', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await createPending(store);
    let executions = 0;

    const [approved, rejected] = await Promise.allSettled([
      store.approve(pending.id, 'workspace-1', 'user-1', async () => { executions += 1; }),
      store.reject(pending.id, 'workspace-1', 'user-1'),
    ]);

    if (approved.status === 'fulfilled') {
      expect(rejected.status).toBe('rejected');
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({ code: 'approval.not_pending' });
      expect(executions).toBe(1);
    } else {
      expect(rejected.status).toBe('fulfilled');
      expect(executions).toBe(0);
    }
  });

  it('a failing executor leaves the operation pending and allows a successful retry', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await createPending(store);
    let calls = 0;

    await expect(store.approve(pending.id, 'workspace-1', 'user-1', async () => {
      calls += 1;
      throw new Error('transient failure');
    })).rejects.toThrow('transient failure');

    expect(calls).toBe(1);
    const retried = await store.approve(pending.id, 'workspace-1', 'user-1', async () => {
      calls += 1;
      return { transactionId: 'tx-1' };
    });
    expect(retried.status).toBe('approved');
    expect(calls).toBe(2);
  });

  it('rejects approval attempts on a finalized rejected or expired operation', async () => {
    const store = createInMemoryPendingOperationStore();
    const rejected = await createPending(store, { idempotencyKey: 'intent-rejected' });
    await store.reject(rejected.id, 'workspace-1', 'user-1');
    await expect(store.approve(rejected.id, 'workspace-1', 'user-1')).rejects.toMatchObject({ code: 'approval.not_pending' });

    const expired = await createPending(store, { idempotencyKey: 'intent-expired' });
    (expired as { status: string }).status = 'expired';
    await expect(store.approve(expired.id, 'workspace-1', 'user-1')).rejects.toMatchObject({ code: 'approval.not_pending' });
  });

  it('never invokes the executor for a different requester', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await createPending(store);
    let executions = 0;
    await expect(store.approve(pending.id, 'workspace-1', 'user-2', async () => { executions += 1; }))
      .rejects.toMatchObject({ code: 'approval.requester_only' });
    expect(executions).toBe(0);
  });
});