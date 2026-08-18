import { describe, expect, it } from 'vitest';
import { createPendingApproval } from '../../src/approvals/guard.js';
import { createApprovalPolicy } from '../../src/approvals/policy.js';
import { createInMemoryPendingOperationStore, type PendingOperation, type PendingOperationStore } from '../../src/approvals/pending.js';

const pending: PendingOperation = {
  id: '11111111-1111-4111-8111-111111111111',
  householdId: 'workspace-1',
  requesterId: 'channel-actor-1',
  operation: 'transactions.expense.create',
  payload: { amountCents: 50000 },
  reason: 'high_value',
  idempotencyKey: 'intent-1',
  status: 'pending',
  createdAt: '2026-08-15T00:00:00.000Z',
  expiresAt: '2026-08-15T00:30:00.000Z',
};

describe('pending context propagation', () => {
  it('passes server-owned chatId into canonical pending creation', async () => {
    const inputs: unknown[] = [];
    const store = {
      create: async (input: unknown) => {
        inputs.push(input);
        return pending;
      },
    } as PendingOperationStore;

    await createPendingApproval(createApprovalPolicy(), store, {
      householdId: 'workspace-1',
      requesterId: 'channel-actor-1',
      operation: 'transactions.expense.create',
      payload: { amountCents: 50000 },
      idempotencyKey: 'intent-1',
      amountCents: 50000,
      destructive: false,
      chatId: 'chat-1',
    });

    expect(inputs[0]).toMatchObject({ chatId: 'chat-1' });
  });

  it('omits chatId for API calls without bridge context', async () => {
    const inputs: unknown[] = [];
    const store = {
      create: async (input: unknown) => {
        inputs.push(input);
        return pending;
      },
    } as PendingOperationStore;

    await createPendingApproval(createApprovalPolicy(), store, {
      householdId: 'workspace-1',
      requesterId: 'device-1',
      operation: 'transactions.expense.create',
      payload: { amountCents: 50000 },
      idempotencyKey: 'intent-2',
      amountCents: 50000,
      destructive: false,
    });

    expect(inputs[0]).not.toHaveProperty('chatId');
  });
  it('matches only the same workspace and non-expired pending chat context', async () => {
    const store = createInMemoryPendingOperationStore();
    const record = await store.create({
      householdId: 'workspace-1',
      chatId: 'chat-1',
      requesterId: 'device-1',
      operation: 'transactions.expense.create',
      payload: {},
      reason: 'high_value',
      idempotencyKey: 'intent-3',
    });

    expect(await store.findByChatId('chat-1', 'workspace-1')).toEqual(record);
    expect(await store.findByChatId('chat-1', 'workspace-2')).toBeUndefined();

    record.expiresAt = new Date(Date.now() - 1_000).toISOString();
    expect(await store.findByChatId('chat-1', 'workspace-1')).toBeUndefined();
  });
});
