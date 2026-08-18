import { describe, expect, it } from 'vitest';
import { createInMemoryPendingOperationStore } from '../../src/approvals/pending.js';

describe('pending operations', () => {
  it('persists requester and approval metadata', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await store.create({
      householdId: 'workspace-1', requesterId: 'user-1', operation: 'transactions.expense.create',
      payload: { amountCents: 50_000 }, reason: 'high_value', idempotencyKey: 'intent-1',
    });

    expect(pending).toMatchObject({ householdId: 'workspace-1', requesterId: 'user-1', status: 'pending', reason: 'high_value' });
  });

  it('allows only requester to approve', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await store.create({
      householdId: 'workspace-1', requesterId: 'user-1', operation: 'transactions.expense.create',
      payload: {}, reason: 'high_value', idempotencyKey: 'intent-1',
    });

    await expect(store.approve(pending.id, 'workspace-1', 'user-2')).rejects.toMatchObject({ code: 'approval.requester_only' });
  });

  it('approves and executes a pending operation exactly once', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await store.create({
      householdId: 'workspace-1', requesterId: 'user-1', operation: 'transactions.expense.create',
      payload: {}, reason: 'high_value', idempotencyKey: 'intent-1',
    });
    let executions = 0;

const approved = await store.approve(pending.id, 'workspace-1', 'user-1', async () => {
      executions += 1;
      return { transactionId: 'tx-1' };
    });
    expect(approved).toMatchObject({ status: 'approved', execution: { transactionId: 'tx-1' } });
    const retried = await store.approve(pending.id, 'workspace-1', 'user-1', async () => {
      executions += 1;
      return { transactionId: 'tx-1' };
    });
    expect(retried).toMatchObject({ status: 'approved', execution: { transactionId: 'tx-1' } });
    expect(executions).toBe(1);
  });
});
