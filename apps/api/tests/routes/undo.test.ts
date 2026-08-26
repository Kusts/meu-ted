import { describe, expect, it } from 'vitest';
import { buildTestApp, TOKEN_A, TOKEN_B } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import { createInMemoryAuditLogStore } from '../../src/audit/store.js';
import { createInMemoryPendingOperationStore } from '../../src/approvals/pending.js';
import type { Transaction } from '../../src/types/domain.js';

const ACCOUNT = {
  id: 'acct-1',
  householdId: HOUSEHOLD_A,
  name: 'A',
  kind: 'bank',
  balanceCents: 48000,
  status: 'active',
} as never;

const CATEGORY = {
  id: 'cat-1',
  householdId: HOUSEHOLD_A,
  name: 'Food',
  kind: 'expense',
  status: 'active',
} as never;

const TX: Transaction = {
  id: 'tx-1',
  householdId: HOUSEHOLD_A,
  kind: 'expense',
  description: 'Lunch',
  amountCents: 2000,
  date: '2026-06-10',
  accountId: 'acct-1',
  categoryId: 'cat-1',
};

const makeAuditLogs = () =>
  createInMemoryAuditLogStore([
    {
      id: 'audit-1',
      workspaceId: HOUSEHOLD_A,
      actorType: 'device',
      actorId: 'dev-device-1',
      operation: 'transactions.expense.create',
      eventType: 'create',
      payloadHash: 'hash-1',
      metadata: { entityId: 'tx-1', description: 'Lunch', amountCents: 2000 },
      createdAt: '2026-06-10T12:00:00.000Z',
    } as never,
  ]);

const buildApp = () =>
  buildTestApp(
    { accounts: [ACCOUNT], categories: [CATEGORY], transactions: [TX] },
    undefined,
    undefined,
    undefined,
    undefined,
    createInMemoryPendingOperationStore(),
    undefined,
    undefined,
    undefined,
    makeAuditLogs(),
  );

const headers = () => ({ 'x-device-token': TOKEN_A, 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() });

describe('undo last action (server-owned)', () => {
  it('undoes the last eligible action of the actor and workspace', async () => {
    const { app } = buildApp();
    const account = await app.inject({ method: 'POST', url: '/accounts', headers: headers(), payload: { name: 'A', kind: 'bank', initialBalanceCents: 50_000 } });
    const category = await app.inject({ method: 'POST', url: '/categories', headers: headers(), payload: { name: 'Food', kind: 'expense' } });
    await app.inject({ method: 'POST', url: '/transactions/expense', headers: headers(), payload: { description: 'Lunch', amountCents: 2_000, date: '2026-06-10', accountId: account.json().id, categoryId: category.json().id } });
    const undone = await app.inject({ method: 'POST', url: '/pending-operations/undo', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'undo-1' } });
    expect(undone.statusCode).toBe(200);
    expect(undone.json().undone.operation).toBe('transactions.expense.create');
  });

  it('returns 403 for undo from a different actor or workspace', async () => {
    const { app } = buildApp();
    const undone = await app.inject({ method: 'POST', url: '/pending-operations/undo', headers: { 'x-device-token': TOKEN_B, 'idempotency-key': 'undo-2' } });
    expect(undone.statusCode).toBe(403);
  });

  it('returns canonical result on undo retry with the same idempotency key', async () => {
    const { app } = buildApp();
    const first = await app.inject({ method: 'POST', url: '/pending-operations/undo', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'undo-3' } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: 'POST', url: '/pending-operations/undo', headers: { 'x-device-token': TOKEN_A, 'idempotency-key': 'undo-3' } });
    expect(second.statusCode).toBe(200);
    expect(second.json().undone).toEqual(first.json().undone);
  });
});