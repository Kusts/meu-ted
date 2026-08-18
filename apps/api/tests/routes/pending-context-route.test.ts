import { afterEach, describe, expect, it } from 'vitest';
import { createContextToken } from '../../src/auth/context-token.js';
import { createInMemoryPendingOperationStore } from '../../src/approvals/pending.js';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';

const SECRET = 'pending-route-context-secret';

const headers = (contextToken?: string) => ({
  'x-device-token': 'dev-token-1',
  ...(contextToken ? { 'x-pi-context-token': contextToken } : {}),
});

afterEach(() => {
  delete process.env.PI_CONTEXT_TOKEN_SECRET;
});

describe('pending details dual route', () => {
  it('resolves canonical id and legacy chatId only from authenticated context', async () => {
    process.env.PI_CONTEXT_TOKEN_SECRET = SECRET;
    const store = createInMemoryPendingOperationStore();
    const pending = await store.create({
      householdId: HOUSEHOLD_A,
      chatId: 'chat-route',
      requesterId: 'channel-actor-1',
      operation: 'transactions.expense.create',
      payload: {},
      reason: 'high_value',
      idempotencyKey: 'route-1',
    });
    const { app } = buildTestApp({}, store);

    const canonical = await app.inject({
      method: 'GET',
      url: `/pending-operations/details?pendingOperationId=${pending.id}`,
      headers: headers(),
    });
    expect(canonical.statusCode).toBe(200);
    expect(canonical.json().operation.id).toBe(pending.id);

    const token = await createContextToken({
      channelActorId: 'channel-actor-1',
      workspaceId: HOUSEHOLD_A,
      chatId: 'chat-route',
      providerMessageId: 'provider-route',
      requestId: 'request-route',
    }, SECRET);
    const legacy = await app.inject({
      method: 'GET',
      url: '/pending-operations/details?chatId=chat-route',
      headers: headers(token),
    });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json().operation.id).toBe(pending.id);

    const missingContext = await app.inject({
      method: 'GET',
      url: '/pending-operations/details?chatId=chat-route',
      headers: headers(),
    });
    expect(missingContext.statusCode).toBe(403);
  });

  it('rejects missing or ambiguous pending identity', async () => {
    const { app } = buildTestApp();
    const missing = await app.inject({ method: 'GET', url: '/pending-operations/details', headers: headers() });
    const both = await app.inject({
      method: 'GET',
      url: '/pending-operations/details?pendingOperationId=11111111-1111-4111-8111-111111111111&chatId=chat-route',
      headers: headers(),
    });
    expect(missing.statusCode).toBe(400);
    expect(both.statusCode).toBe(400);
  });
});
