import { afterEach, describe, expect, it } from 'vitest';
import { createContextToken } from '../../src/auth/context-token.js';
import { createInMemoryPendingOperationStore } from '../../src/approvals/pending.js';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

const SECRET = 'pending-write-dual-secret';
const headers = (token?: string) => ({
  'x-device-token': 'dev-token-1',
  ...(token ? { 'x-pi-context-token': token } : {}),
});

const createPending = async (chatId: string, key: string) => {
  const store = createInMemoryPendingOperationStore();
  const pending = await store.create({
    householdId: HOUSEHOLD_A,
    chatId,
    requesterId: 'dev-device-1',
    operation: 'transactions.expense.create',
    payload: { amountCents: 50000 },
    reason: 'high_value',
    idempotencyKey: key,
  });
  return { store, pending };
};

afterEach(() => {
  delete process.env.PI_CONTEXT_TOKEN_SECRET;
});

describe('pending write dual routes', () => {
  it('approves by canonical pendingOperationId', async () => {
    const { store, pending } = await createPending('chat-approve', 'approve-1');
    const { app } = buildTestApp({}, store);

    const response = await app.inject({
      method: 'POST',
      url: `/pending-operations/approve?pendingOperationId=${pending.id}`,
      headers: headers(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('approved');
  });

  it('rejects by legacy chatId only with matching context token', async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = SECRET;
    const { store, pending } = await createPending('chat-reject', 'reject-1');
    const { app } = buildTestApp({}, store);
    const token = await createContextToken({
      channelActorId: 'channel-actor',
      workspaceId: HOUSEHOLD_A,
      chatId: 'chat-reject',
      providerMessageId: 'provider-reject',
      requestId: 'request-reject',
    }, SECRET);

    const response = await app.inject({
      method: 'POST',
      url: '/pending-operations/reject?chatId=chat-reject',
      headers: headers(token),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('rejected');
    expect((await store.get(pending.id, HOUSEHOLD_A)).status).toBe('rejected');
  });

  it('rejects absent or ambiguous identity', async () => {
    const { app } = buildTestApp();
    const missing = await app.inject({ method: 'POST', url: '/pending-operations/approve', headers: headers() });
    const both = await app.inject({
      method: 'POST',
      url: '/pending-operations/reject?pendingOperationId=11111111-1111-4111-8111-111111111111&chatId=chat',
      headers: headers(),
    });
    expect(missing.statusCode).toBe(400);
    expect(both.statusCode).toBe(400);
  });
});
