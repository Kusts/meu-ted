import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createInMemoryPendingOperationV2Store } from '../../src/approvals/pending-v2.js';
import type { PendingExecutor } from '../../src/approvals/pending.js';
import { registerPendingOperationRoutes } from '../../src/routes/pending-operations.js';

const legacyStore = {
  async get() { return null; }, async list() { return []; }, async findByChatId() { return null; },
  async create() { throw new Error('unused'); }, async approve() { throw new Error('unused'); },
  async reject() { throw new Error('unused'); },
};

const ALL = [
  'financial.approval.propose',
  'financial.approval.read',
  'financial.approval.confirm',
  'financial.approval.execute',
  'financial.approval.retry',
  'financial.approval.cancel',
  'financial.approval.reconcile',
];

type LabelMode = 'ok' | 'empty' | 'partial' | 'throw';

/**
 * FIX-API-ACTIONABLE-PRESENTATION-GATE: route-level harness. The read model
 * is mutable per test so the SAME operation can be actionable at propose/
 * confirm time and unactionable later (label loss), mirroring production
 * where labels resolve from the current server read model — never from
 * client input. The store is wrapped to count confirm/retry invocations,
 * proving the gate runs BEFORE the store (zero calls, no attestation,
 * no status transition on block).
 */
const harness = (executor?: PendingExecutor) => {
  const accountId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  let mode: LabelMode = 'ok';
  const readModel = {
    listAccounts: async (): Promise<Array<{ id: string; name: string }>> => {
      if (mode === 'throw') throw new Error('read model down');
      if (mode === 'empty') return [];
      return [{ id: accountId, name: 'Conta Corrente' }];
    },
    listCategories: async (): Promise<Array<{ id: string; name: string }>> => {
      if (mode === 'throw') throw new Error('read model down');
      if (mode === 'empty' || mode === 'partial') return [];
      return [{ id: categoryId, name: 'Alimentação' }];
    },
  };
  const inner = createInMemoryPendingOperationV2Store();
  let confirmCalls = 0;
  let retryCalls = 0;
  const v2Store = { ...inner };
  v2Store.confirm = (async (id: string, identity: Parameters<typeof inner.confirm>[1]) => {
    confirmCalls += 1;
    return inner.confirm(id, identity);
  }) as typeof inner.confirm;
  v2Store.retry = (async (id: string, identity: Parameters<typeof inner.retry>[1]) => {
    retryCalls += 1;
    return inner.retry(id, identity);
  }) as typeof inner.retry;
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    request.delegatedTurn = {
      iss: 'pi-agent', aud: 'pi-finance-api', sub: 'a', workspace: 'w',
      role: 'owner', capabilities: ALL, jti: crypto.randomUUID(), request: 'r',
      deviceId: 'd', iat: 1, exp: 9999999999,
    };
    request.authenticatedContext = {
      householdId: 'w', actorId: 'a', authUserId: 'a',
      actorType: 'user', deviceId: 'd', role: 'owner',
    };
  });
  registerPendingOperationRoutes(app, {
    store: legacyStore,
    resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }),
    v2Store,
    v2Executor: executor ?? (async () => ({ status: 'succeeded', operationId: crypto.randomUUID() })),
    v2Only: true,
    readModel,
  } as Parameters<typeof registerPendingOperationRoutes>[1]);
  const args = () => ({
    description: 'Mercado semanal',
    amountCents: 8500,
    date: '2026-09-14',
    accountId,
    categoryId,
  });
  const propose = () =>
    app.inject({
      method: 'POST', url: '/pending-operations/v2/propose',
      headers: { 'idempotency-key': crypto.randomUUID() },
      payload: { tool: 'transactions.expense.create', normalizedArgs: args() },
    });
  return { app, store: inner, propose, setMode: (m: LabelMode) => { mode = m; }, counts: () => ({ confirmCalls, retryCalls }) };
};

const failingExecutor: PendingExecutor = async () => {
  throw Object.assign(new Error('controlled-failure'), { code: 'executor.failed' });
};

describe('FIX-API-ACTIONABLE-PRESENTATION-GATE: confirm/Retry require a server-derived actionable presentation', () => {
  it('blocks direct confirm of a proposed operation with no resolvable labels (409, zero store calls, no transition)', async () => {
    const { app, propose, setMode, counts } = harness();
    setMode('empty');
    const proposed = await propose();
    expect(proposed.statusCode).toBe(201);
    const id = proposed.json().id as string;

    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(confirmed.statusCode).toBe(409);
    expect(confirmed.json().code).toBe('approval.not_actionable');
    expect(counts().confirmCalls).toBe(0);
    // No attestation, no authority material, no raw internals in the block.
    expect(confirmed.json()).not.toHaveProperty('attestation');
    expect(JSON.stringify(confirmed.json())).not.toContain('normalizedArgs');

    const status = await app.inject({ method: 'GET', url: `/pending-operations/v2/${id}` });
    expect(status.statusCode).toBe(200);
    expect(status.json().status).toBe('proposed');
    expect(status.json()).not.toHaveProperty('attestation');
  });

  it('blocks retry of a failed operation with no resolvable labels (409, zero store calls, stays failed)', async () => {
    const { app, propose, setMode, counts } = harness(failingExecutor);
    const proposed = await propose();
    const id = proposed.json().id as string;
    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(confirmed.statusCode).toBe(200);
    await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/execute`, payload: { attestation: confirmed.json().attestation } });

    setMode('empty');
    const retried = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/retry` });
    expect(retried.statusCode).toBe(409);
    expect(retried.json().code).toBe('approval.not_actionable');
    expect(counts().retryCalls).toBe(0);
    expect(retried.json()).not.toHaveProperty('attestation');

    const status = await app.inject({ method: 'GET', url: `/pending-operations/v2/${id}` });
    expect(status.json().status).toBe('failed');
  });

  it('blocks confirm when only the category label is missing (partial presentation is not actionable)', async () => {
    const { app, propose, setMode, counts } = harness();
    setMode('partial');
    const proposed = await propose();
    const id = proposed.json().id as string;

    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(confirmed.statusCode).toBe(409);
    expect(confirmed.json().code).toBe('approval.not_actionable');
    expect(counts().confirmCalls).toBe(0);
  });

  it('maps a read-model failure to a safe retryable error with no driver text and no transition', async () => {
    const { app, propose, setMode, counts } = harness();
    setMode('throw');
    const proposed = await propose();
    expect(proposed.statusCode).toBe(201);
    const id = proposed.json().id as string;

    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(confirmed.statusCode).toBe(503);
    expect(confirmed.json().code).toBe('approval.presentation_unavailable');
    // Safe: never echoes the raw driver/read-model message.
    expect(JSON.stringify(confirmed.json())).not.toContain('read model down');
    expect(counts().confirmCalls).toBe(0);

    const status = await app.inject({ method: 'GET', url: `/pending-operations/v2/${id}` });
    expect(status.json().status).toBe('proposed');
  });

  it('lets an actionable confirm/retry through with the normal attestation transition', async () => {
    const { app, propose, counts } = harness(failingExecutor);
    const proposed = await propose();
    const id = proposed.json().id as string;

    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(confirmed.statusCode).toBe(200);
    expect(typeof confirmed.json().attestation).toBe('string');
    expect(counts().confirmCalls).toBe(1);

    await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/execute`, payload: { attestation: confirmed.json().attestation } });
    const retried = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/retry` });
    expect(retried.statusCode).toBe(200);
    expect(typeof retried.json().attestation).toBe('string');
    expect(counts().retryCalls).toBe(1);
  });

  it('confirm on already-confirmed keeps re-attestation recovery even when the display projection is gone', async () => {
    const { app, propose, setMode } = harness();
    const proposed = await propose();
    const id = proposed.json().id as string;
    const first = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(first.statusCode).toBe(200);

    // Labels vanish after confirmation: the idempotent recovery path
    // (§9/H-03) must NOT be gated by a fresh display projection.
    setMode('empty');
    const second = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(second.statusCode).toBe(200);
    expect(typeof second.json().attestation).toBe('string');
    expect(second.json().attestation).not.toBe(first.json().attestation);
  });

  it('cancel stays available without resolvable labels (it moves no money)', async () => {
    const { app, propose, setMode } = harness();
    setMode('empty');
    const proposed = await propose();
    const id = proposed.json().id as string;

    const cancelled = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/cancel` });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().status).toBe('cancelled');
  });

  it('unknown or foreign ids remain rejected by the existing store binding (no existence leak)', async () => {
    const { app } = harness();
    const unknown = await app.inject({
      method: 'POST',
      url: '/pending-operations/v2/00000000-0000-4000-8000-000000000000/confirm',
    });
    expect(unknown.statusCode).toBe(403);
    expect(unknown.json().code).toBe('approval.forbidden');
  });
});
