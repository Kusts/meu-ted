import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { createInMemoryPendingOperationStore } from '../../src/approvals/pending.js';
import type { PendingOperation } from '../../src/approvals/pending.js';

type PendingInput = Pick<PendingOperation, 'householdId' | 'requesterId' | 'operation' | 'payload' | 'reason' | 'idempotencyKey'>;

const seedPending = (store: ReturnType<typeof createInMemoryPendingOperationStore>, overrides: Partial<PendingInput> = {}) =>
  store.create({
    householdId: HOUSEHOLD_A,
    requesterId: 'dev-device-1',
    operation: 'transactions.expense.create',
    payload: { description: 'Large', amountCents: 50_000 },
    reason: 'high_value',
    idempotencyKey: 'intent-1',
    ...overrides,
  } as PendingInput);

describe('pending operation approval (server-owned)', () => {
  it('lists pending operations only for the authenticated workspace', async () => {
    const store = createInMemoryPendingOperationStore();
    await seedPending(store);
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, store);
    const listed = await app.inject({ method: 'GET', url: '/pending-operations?status=pending', headers: { 'x-device-token': TOKEN_A } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().items).toHaveLength(1);
    const other = await app.inject({ method: 'GET', url: '/pending-operations?status=pending', headers: { 'x-device-token': TOKEN_B } });
    expect(other.json().items).toHaveLength(0);
  });

  it('lets the requestor approve a pending write', async () => {
    const store = createInMemoryPendingOperationStore();
    await seedPending(store);
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, store);
    const listed = await app.inject({ method: 'GET', url: '/pending-operations?status=pending', headers: { 'x-device-token': TOKEN_A } });
    const id = listed.json().items[0].id;
    const approved = await app.inject({ method: 'POST', url: `/pending-operations/${id}/approve`, headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().status).toBe('approved');
  });

  it('returns 403 for approval from a different actor in the same workspace', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await seedPending(store, { requesterId: 'other-actor' });
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, store);
    const approved = await app.inject({ method: 'POST', url: `/pending-operations/${pending.id}/approve`, headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    expect(approved.statusCode).toBe(403);
  });

  it('returns 403 for approval from a different workspace', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await seedPending(store);
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, store);
    const approved = await app.inject({ method: 'POST', url: `/pending-operations/${pending.id}/approve`, headers: { 'x-device-token': TOKEN_B, 'idempotency-key': crypto.randomUUID() } });
    expect(approved.statusCode).toBe(403);
  });

  it('returns canonical approved result on retry without re-executing', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await seedPending(store);
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, store);
    const first = await app.inject({ method: 'POST', url: `/pending-operations/${pending.id}/approve`, headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'intent-retry' } });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe('approved');
    const second = await app.inject({ method: 'POST', url: `/pending-operations/${pending.id}/approve`, headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'intent-retry' } });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe('approved');
  });

  it('lets the requestor reject a pending write', async () => {
    const store = createInMemoryPendingOperationStore();
    const pending = await seedPending(store);
    const { app } = buildTestApp({}, undefined, undefined, undefined, undefined, store);
    const rejected = await app.inject({ method: 'POST', url: `/pending-operations/${pending.id}/reject`, headers: { 'x-device-token': TOKEN_A, 'idempotency-key': crypto.randomUUID() } });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('rejected');
  });
});