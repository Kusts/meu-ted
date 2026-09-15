/**
 * T6.1 Finding 1 — POST /pending-operations/v2/:id/reconcile (SPEC §11).
 *
 * The store-level reconciler (`reconcileExpiredExecuting`) had no HTTP entry
 * point. This suite pins the controlled Agent-only route wired in
 * routes/pending-operations.ts: delegated `financial.approval.reconcile`
 * capability, identity strictly from the authenticated context (a foreign
 * workspace's id maps to 403, never 404 — no existence leak), 501 without a
 * controlled executor, 409 `execution_in_progress` on a valid lease, 200
 * recovery on an expired lease (SAME idempotencyKey, single effect), and 409
 * `reconcile_not_allowed` on terminal/confirmed states.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { computePendingOperationV2Hash } from '@pi-finance/llm-contracts';
import {
  createInMemoryPendingOperationV2Store,
  type PendingIdentity,
  type PendingOperationV2Store,
} from '../../src/approvals/pending-v2.js';
import { registerPendingOperationRoutes } from '../../src/routes/pending-operations.js';

const legacyStore = {
  async get() { return null; }, async list() { return []; }, async findByChatId() { return null; },
  async create() { throw new Error('unused'); }, async approve() { throw new Error('unused'); },
  async reject() { throw new Error('unused'); },
};

const expenseArgs = () => ({
  description: 'Reconcile probe',
  amountCents: 4100,
  date: '2026-09-14',
  accountId: randomUUID(),
  categoryId: randomUUID(),
});

const RECONCILE = 'financial.approval.reconcile';
const ALL = [
  'financial.approval.propose',
  'financial.approval.read',
  'financial.approval.confirm',
  'financial.approval.execute',
  RECONCILE,
  'financial.approval.retry',
  'financial.approval.cancel',
];

type IdentityParts = { workspace: string; actor: string; device: string };

const scopedApp = (
  identity: IdentityParts,
  capabilities: string[] = ALL,
  opts: {
    leaseMs?: number;
    executor?: (operation: never) => Promise<unknown>;
    sharedStore?: PendingOperationV2Store;
    current?: () => IdentityParts;
  } = {},
) => {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    const current = opts.current?.() ?? identity;
    request.delegatedTurn = {
      iss: 'pi-agent', aud: 'pi-finance-api', sub: current.actor, workspace: current.workspace,
      role: 'owner', capabilities, jti: randomUUID(), request: 'r',
      deviceId: current.device, iat: 1, exp: 301,
    };
    request.authenticatedContext = {
      householdId: current.workspace, actorId: current.actor, authUserId: current.actor,
      actorType: 'user', deviceId: current.device, role: 'owner',
    };
  });
  const v2Store = opts.sharedStore
    ?? createInMemoryPendingOperationV2Store(opts.leaseMs === undefined ? undefined : { leaseMs: opts.leaseMs });
  registerPendingOperationRoutes(app, {
    store: legacyStore,
    resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }),
    v2Store,
    v2Only: true,
    ...(opts.executor ? { v2Executor: opts.executor } : {}),
  });
  return { app, v2Store };
};

const toIdentity = (parts: IdentityParts): PendingIdentity => ({
  workspaceId: parts.workspace, actorId: parts.actor, deviceId: parts.device,
});

const proposeCanonical = async (store: PendingOperationV2Store, parts: IdentityParts, key = randomUUID()) => {
  const identity = toIdentity(parts);
  const base = {
    version: 2 as const,
    workspaceId: identity.workspaceId,
    actorId: identity.actorId,
    deviceId: identity.deviceId,
    tool: 'transactions.expense.create',
    normalizedArgs: expenseArgs(),
    proposalHash: '',
    idempotencyKey: key,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    bindings: { ...identity },
  };
  return store.propose({ ...base, proposalHash: await computePendingOperationV2Hash(base) });
};

/** Fake WriteStore keyed by idempotencyKey: same key → same receipt, no new effect. */
const createFakeWrites = () => {
  const receipts = new Map<string, string>();
  let effects = 0;
  const seenKeys: string[] = [];
  return {
    seenKeys,
    get effects() { return effects; },
    executor: async (operation: { idempotencyKey: string }) => {
      seenKeys.push(operation.idempotencyKey);
      const existing = receipts.get(operation.idempotencyKey);
      if (existing) return { status: 'succeeded', operationId: existing };
      effects += 1;
      const operationId = `mut-${operation.idempotencyKey}`;
      receipts.set(operation.idempotencyKey, operationId);
      return { status: 'succeeded', operationId };
    },
  };
};

const deferred = () => {
  let resolve!: (value: { status: string; operationId: string }) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<{ status: string; operationId: string }>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const waitForLeaseExpiry = async (store: PendingOperationV2Store, id: string, identity: PendingIdentity) => {
  const started = Date.now();
  for (;;) {
    const record = await store.get(id, identity);
    if (record.executionLeaseExpiresAt && Date.parse(record.executionLeaseExpiresAt) <= Date.now()) return record;
    if (Date.now() - started > 5_000) throw new Error('timed out waiting for lease expiry');
    await new Promise((r) => setTimeout(r, 5));
  }
};

const reconcile = (app: FastifyInstance, id: string) =>
  app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/reconcile` });

describe('POST /pending-operations/v2/:id/reconcile (T6.1 Finding 1)', () => {
  it('requires the delegated reconcile capability (Agent-only boundary)', async () => {
    const parts = { workspace: 'ws-cap', actor: 'actor-a', device: 'device-a' };
    const { app, v2Store } = scopedApp(parts, ['financial.approval.execute']);
    const saved = await proposeCanonical(v2Store, parts);
    const denied = await reconcile(app, saved.id);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('auth.delegation_scope_forbidden');

    const noDelegation = Fastify();
    noDelegation.addHook('preHandler', async (request) => {
      request.authenticatedContext = {
        householdId: parts.workspace, actorId: parts.actor, authUserId: parts.actor,
        actorType: 'user', deviceId: parts.device, role: 'owner',
      };
    });
    registerPendingOperationRoutes(noDelegation, {
      store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }),
      v2Store, v2Only: true,
      v2Executor: async () => ({ status: 'succeeded', operationId: randomUUID() }),
    });
    const sessionDenied = await noDelegation.inject({ method: 'POST', url: `/pending-operations/v2/${saved.id}/reconcile` });
    expect(sessionDenied.statusCode).toBe(403);
    expect(sessionDenied.json().code).toBe('auth.delegation_scope_forbidden');
  });

  it('returns 501 when no controlled executor is configured', async () => {
    const parts = { workspace: 'ws-501', actor: 'actor-a', device: 'device-a' };
    const { app, v2Store } = scopedApp(parts, ALL, { leaseMs: 40 });
    const saved = await proposeCanonical(v2Store, parts);
    const missing = await reconcile(app, saved.id);
    expect(missing.statusCode).toBe(501);
    expect(missing.json().code).toBe('unsupported');
  });

  it('valid lease → 409 execution_in_progress without running the reconciler', async () => {
    const parts = { workspace: 'ws-valid', actor: 'actor-a', device: 'device-a' };
    const writes = createFakeWrites();
    const { app, v2Store } = scopedApp(parts, ALL, { executor: writes.executor as never });
    const identity = toIdentity(parts);
    const saved = await proposeCanonical(v2Store, parts);
    const confirmed = await v2Store.confirm(saved.id, identity);
    const gate = deferred();
    const first = v2Store.execute(confirmed.attestation!, identity, () => gate.promise);
    // Wait until the claim is visible, then reconcile over HTTP: the lease is
    // still valid, so the route must refuse without touching the executor.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if ((await v2Store.get(saved.id, identity)).status === 'executing') break;
      await new Promise((r) => setTimeout(r, 5));
    }
    const response = await reconcile(app, saved.id);
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('approval.execution_in_progress');
    expect(writes.effects).toBe(0);
    expect(writes.seenKeys).toHaveLength(0);
    gate.resolve({ status: 'succeeded', operationId: randomUUID() });
    const done = await first;
    expect(done.status).toBe('succeeded');
  });

  it('expired lease → 200 recovery with the SAME idempotencyKey, single effect', async () => {
    const parts = { workspace: 'ws-expired', actor: 'actor-a', device: 'device-a' };
    const writes = createFakeWrites();
    const { app, v2Store } = scopedApp(parts, ALL, { leaseMs: 40, executor: writes.executor as never });
    const identity = toIdentity(parts);
    const key = randomUUID();
    const saved = await proposeCanonical(v2Store, parts, key);
    const confirmed = await v2Store.confirm(saved.id, identity);
    const gate = deferred();
    const first = v2Store.execute(confirmed.attestation!, identity, () => gate.promise);
    await waitForLeaseExpiry(v2Store, saved.id, identity);

    const response = await reconcile(app, saved.id);
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('succeeded');
    expect(response.json().executionAttemptCount).toBe(2);
    // T6.1: the recovery's receipt/mutationId is the authoritative one.
    const recoveryMutationId = response.json().mutationId as string;
    expect(recoveryMutationId).toBeTruthy();
    expect(writes.seenKeys).toEqual([key]);
    expect(writes.effects).toBe(1);
    // The abandoned attempt lands late with the same key → dedup, no effect,
    // and the stale TX2 CANNOT overwrite the recovery's status/receipt/mutationId.
    gate.resolve({ status: 'succeeded', operationId: `mut-${key}` });
    await first;
    expect(writes.effects).toBe(1);
    const final = await v2Store.get(saved.id, identity);
    expect(final.status).toBe('succeeded');
    expect(final.mutationId).toBe(recoveryMutationId);
    expect((final.execution as { receipt: { mutationId: string } }).receipt.mutationId).toBe(recoveryMutationId);
  });

  it('terminal states refuse with reconcile_not_allowed', async () => {
    const parts = { workspace: 'ws-terminal', actor: 'actor-a', device: 'device-a' };
    const { app, v2Store } = scopedApp(parts, ALL, {
      executor: (async () => ({ status: 'succeeded', operationId: randomUUID() })) as never,
    });
    const identity = toIdentity(parts);
    const ok = await proposeCanonical(v2Store, parts);
    const okConfirmed = await v2Store.confirm(ok.id, identity);
    await v2Store.execute(okConfirmed.attestation!, identity, async () => ({ status: 'succeeded', operationId: randomUUID() }));
    const refused = await reconcile(app, ok.id);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe('approval.reconcile_not_allowed');
  });

  it('confirmed refuses with reconcile_not_allowed (recovery is attestation re-emission)', async () => {
    const parts = { workspace: 'ws-confirmed', actor: 'actor-a', device: 'device-a' };
    let ran = false;
    const { app, v2Store } = scopedApp(parts, ALL, {
      executor: (async () => { ran = true; return { status: 'succeeded', operationId: randomUUID() }; }) as never,
    });
    const identity = toIdentity(parts);
    const saved = await proposeCanonical(v2Store, parts);
    await v2Store.confirm(saved.id, identity);
    const refused = await reconcile(app, saved.id);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe('approval.reconcile_not_allowed');
    expect(ran).toBe(false);
  });

  it('identity scoping: a foreign workspace cannot reconcile (403, no existence leak)', async () => {
    const owner: IdentityParts = { workspace: 'ws-owner', actor: 'actor-a', device: 'device-a' };
    const sharedStore = createInMemoryPendingOperationV2Store({ leaseMs: 40 });
    let current: IdentityParts = owner;
    const { app } = scopedApp(owner, ALL, {
      sharedStore,
      current: () => current,
      executor: (async () => ({ status: 'succeeded', operationId: randomUUID() })) as never,
    });
    const saved = await proposeCanonical(sharedStore, owner);
    const confirmed = await sharedStore.confirm(saved.id, toIdentity(owner));
    const gate = deferred();
    const first = sharedStore.execute(confirmed.attestation!, toIdentity(owner), () => gate.promise);
    await waitForLeaseExpiry(sharedStore, saved.id, toIdentity(owner));

    // Same operation id, authenticated as a FOREIGN workspace: the store
    // rejects the cross-workspace binding (403 either way — never a 404
    // existence signal and never a state transition).
    current = { workspace: 'ws-foreign', actor: 'actor-a', device: 'device-a' };
    const foreign = await reconcile(app, saved.id);
    expect(foreign.statusCode).toBe(403);
    expect(['approval.forbidden', 'approval.binding_mismatch']).toContain(foreign.json().code);

    // An unknown id in the foreign workspace is equally opaque (404 mapped
    // to 403 — no existence leak across the workspace boundary).
    const unknown = await reconcile(app, randomUUID());
    expect(unknown.statusCode).toBe(403);
    expect(unknown.json().code).toBe('approval.forbidden');

    // The owner can still recover over the same route.
    current = owner;
    const recovered = await reconcile(app, saved.id);
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json().status).toBe('succeeded');
    gate.resolve({ status: 'succeeded', operationId: randomUUID() });
    await first;
  });
});
