import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { createInMemoryPendingOperationV2Store } from '../../src/approvals/pending-v2.js';
import { registerPendingOperationRoutes } from '../../src/routes/pending-operations.js';

const legacyStore = {
  async get() { return null; }, async list() { return []; }, async findByChatId() { return null; },
  async create() { throw new Error('unused'); }, async approve() { throw new Error('unused'); },
  async reject() { throw new Error('unused'); },
};

describe('pending operation V2 routes', () => {
  it('does not expose V2 when the authoritative store is absent', async () => {
    const app = Fastify();
    registerPendingOperationRoutes(app, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }) });
    const response = await app.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'x-device-token': 'x', 'idempotency-key': 'k' }, payload: {} });
    expect(response.statusCode).toBe(404);
  });

  it('returns 501 for execution when no controlled V2 executor is configured', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.delegatedTurn = { iss: 'pi-agent', aud: 'pi-finance-api', sub: 'a', workspace: 'w', role: 'owner', capabilities: ['financial.approval.execute'], jti: 'j', request: 'r', deviceId: 'd', iat: 1, exp: 301 };
      request.authenticatedContext = { householdId: 'w', actorId: 'a', authUserId: 'a', actorType: 'user', deviceId: 'd', role: 'owner' };
    });
    registerPendingOperationRoutes(app, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }), v2Store: createInMemoryPendingOperationV2Store(), v2Only: true });
    const response = await app.inject({ method: 'POST', url: '/pending-operations/v2/00000000-0000-4000-8000-000000000000/execute', payload: { attestation: 'a'.repeat(32) } });
    expect(response.statusCode).toBe(501);
  });

  it('rejects browser/session and generic financial.write callers at the V2 boundary', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.authenticatedContext = { householdId: 'w', actorId: 'a', authUserId: 'a', actorType: 'user', deviceId: 'd', role: 'owner' };
    });
    registerPendingOperationRoutes(app, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }), v2Store: createInMemoryPendingOperationV2Store(), v2Only: true });

    const session = await app.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'idempotency-key': 'session-key' }, payload: { tool: 'transactions.expense.create', normalizedArgs: {} } });
    expect(session.statusCode).toBe(403);
    expect(session.json().code).toBe('auth.delegation_scope_forbidden');

    const generic = Fastify();
    generic.addHook('preHandler', async (request) => {
      request.delegatedTurn = { iss: 'pi-agent', aud: 'pi-finance-api', sub: 'a', workspace: 'w', role: 'owner', capabilities: ['financial.write'], jti: 'j', request: 'r', deviceId: 'd', iat: 1, exp: 301 };
      request.authenticatedContext = { householdId: 'w', actorId: 'a', authUserId: 'a', actorType: 'user', deviceId: 'd', role: 'owner' };
    });
    registerPendingOperationRoutes(generic, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }), v2Store: createInMemoryPendingOperationV2Store(), v2Only: true });
    const denied = await generic.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'idempotency-key': 'generic-key' }, payload: { tool: 'transactions.expense.create', normalizedArgs: {} } });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('auth.delegation_scope_forbidden');
  });

  it('allows only delegated approval capabilities and keeps attestation behind that boundary', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.delegatedTurn = { iss: 'pi-agent', aud: 'pi-finance-api', sub: 'a', workspace: 'w', role: 'owner', capabilities: ['financial.approval.propose', 'financial.approval.confirm', 'financial.approval.execute', 'financial.approval.retry', 'financial.approval.cancel'], jti: crypto.randomUUID(), request: 'r', deviceId: 'd', iat: 1, exp: 301 };
      request.authenticatedContext = { householdId: 'w', actorId: 'a', authUserId: 'a', actorType: 'user', deviceId: 'd', role: 'owner' };
    });
    const v2Store = createInMemoryPendingOperationV2Store();
    registerPendingOperationRoutes(app, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }), v2Store, v2Executor: async () => ({ status: 'succeeded', operationId: crypto.randomUUID() }), v2Only: true });
    const proposed = await app.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'idempotency-key': 'approval-key' }, payload: { tool: 'transactions.expense.create', normalizedArgs: {} } });
    expect(proposed.statusCode).toBe(201);
    const id = proposed.json().id;
    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(confirmed.statusCode).toBe(200);
    expect(typeof confirmed.json().attestation).toBe('string');

    const browser = Fastify();
    browser.addHook('preHandler', async (request) => {
      request.authenticatedContext = { householdId: 'w', actorId: 'a', authUserId: 'a', actorType: 'user', deviceId: 'd', role: 'owner' };
    });
    registerPendingOperationRoutes(browser, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }), v2Store, v2Only: true });
    const browserConfirm = await browser.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    expect(browserConfirm.statusCode).toBe(403);
    expect(browserConfirm.json().code).toBe('auth.delegation_scope_forbidden');
  });

  it('exposes retry only with the delegated approval retry capability', async () => {
    const app = Fastify();
    app.addHook('preHandler', async (request) => {
      request.delegatedTurn = { iss: 'pi-agent', aud: 'pi-finance-api', sub: 'a', workspace: 'w', role: 'owner', capabilities: ['financial.approval.propose', 'financial.approval.confirm', 'financial.approval.execute', 'financial.approval.retry'], jti: crypto.randomUUID(), request: 'r', deviceId: 'd', iat: 1, exp: 301 };
      request.authenticatedContext = { householdId: 'w', actorId: 'a', authUserId: 'a', actorType: 'user', deviceId: 'd', role: 'owner' };
    });
    const v2Store = createInMemoryPendingOperationV2Store();
    registerPendingOperationRoutes(app, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }), v2Store, v2Executor: async () => { throw new Error('controlled-failure'); }, v2Only: true });
    const proposed = await app.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'idempotency-key': 'retry-key' }, payload: { tool: 'transactions.expense.create', normalizedArgs: {} } });
    const id = proposed.json().id;
    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/execute`, payload: { attestation: confirmed.json().attestation } });
    const retried = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/retry` });
    expect(retried.statusCode).toBe(200);
    expect(typeof retried.json().attestation).toBe('string');
  });
});
