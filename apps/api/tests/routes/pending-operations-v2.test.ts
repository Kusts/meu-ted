import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { createInMemoryPendingOperationV2Store } from '../../src/approvals/pending-v2.js';
import { registerPendingOperationRoutes } from '../../src/routes/pending-operations.js';

const legacyStore = {
  async get() { return null; }, async list() { return []; }, async findByChatId() { return null; },
  async create() { throw new Error('unused'); }, async approve() { throw new Error('unused'); },
  async reject() { throw new Error('unused'); },
};

const expenseArgs = () => ({
  description: 'Mercado semanal',
  amountCents: 8500,
  date: '2026-09-14',
  accountId: crypto.randomUUID(),
  categoryId: crypto.randomUUID(),
});

const incomeArgs = () => ({
  description: 'Salário mensal',
  amountCents: 200000,
  date: '2026-09-14',
  accountId: crypto.randomUUID(),
  categoryId: crypto.randomUUID(),
});

const delegatedProposeApp = () => {
  const app = Fastify();
  app.addHook('preHandler', async (request) => {
    request.delegatedTurn = { iss: 'pi-agent', aud: 'pi-finance-api', sub: 'a', workspace: 'w', role: 'owner', capabilities: ['financial.approval.propose', 'financial.approval.confirm'], jti: crypto.randomUUID(), request: 'r', deviceId: 'd', iat: 1, exp: 301 };
    request.authenticatedContext = { householdId: 'w', actorId: 'a', authUserId: 'a', actorType: 'user', deviceId: 'd', role: 'owner' };
  });
  const v2Store = createInMemoryPendingOperationV2Store();
  registerPendingOperationRoutes(app, { store: legacyStore, resolveToken: async () => ({ householdId: 'w', deviceId: 'd' }), v2Store, v2Only: true });
  return { app, v2Store };
};

const propose = (app: FastifyInstance, key: string, body: unknown) =>
  app.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'idempotency-key': key }, payload: body });

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
    const proposed = await app.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'idempotency-key': 'approval-key' }, payload: { tool: 'transactions.expense.create', normalizedArgs: expenseArgs() } });
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
    const proposed = await app.inject({ method: 'POST', url: '/pending-operations/v2/propose', headers: { 'idempotency-key': 'retry-key' }, payload: { tool: 'transactions.expense.create', normalizedArgs: expenseArgs() } });
    expect(proposed.statusCode).toBe(201);
    const id = proposed.json().id;
    const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/confirm` });
    await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/execute`, payload: { attestation: confirmed.json().attestation } });
    const retried = await app.inject({ method: 'POST', url: `/pending-operations/v2/${id}/retry` });
    expect(retried.statusCode).toBe(200);
    expect(typeof retried.json().attestation).toBe('string');
  });

  describe('propose canonical validation and idempotency (SPEC §7.4, §7.7)', () => {
    it('accepts canonical expense args with 201', async () => {
      const { app } = delegatedProposeApp();
      const response = await propose(app, 'expense-key', { tool: 'transactions.expense.create', normalizedArgs: expenseArgs() });
      expect(response.statusCode).toBe(201);
      expect(response.json().id).toBeTruthy();
      expect(response.json().status).toBe('proposed');
    });

    it('accepts canonical income args with 201', async () => {
      const { app } = delegatedProposeApp();
      const response = await propose(app, 'income-key', { tool: 'transactions.income.create', normalizedArgs: incomeArgs() });
      expect(response.statusCode).toBe(201);
      expect(response.json().id).toBeTruthy();
    });

    it('rejects empty normalizedArgs without persisting', async () => {
      const { app, v2Store } = delegatedProposeApp();
      const before = v2Store.audit.length;
      const response = await propose(app, 'empty-key', { tool: 'transactions.expense.create', normalizedArgs: {} });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('approval.invalid_args');
      expect(response.json().details).toBeTruthy();
      expect(v2Store.audit.length).toBe(before);
    });

    it('rejects the legacy categoryQuery shape (missing canonical categoryId)', async () => {
      const { app } = delegatedProposeApp();
      const args = { description: 'Mercado', amountCents: 5000, date: '2026-09-14', accountId: crypto.randomUUID(), categoryQuery: 'alimentação' };
      const response = await propose(app, 'legacy-shape-key', { tool: 'transactions.expense.create', normalizedArgs: args });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('approval.invalid_args');
    });

    it('rejects a wrong-tool payload (transfer shape sent as income)', async () => {
      // NOTE: expense/income canonical schemas are structurally identical, so a
      // literal expense↔income cross-send cannot be distinguished at schema level.
      // Per-tool routing is proven by the unknown-tool case below plus both-tools
      // enforcement here: a transfer-shaped payload fits neither registry schema.
      const { app } = delegatedProposeApp();
      const args = { description: 'Transfer', amountCents: 1000, date: '2026-09-14', fromAccountId: crypto.randomUUID(), toAccountId: crypto.randomUUID() };
      const response = await propose(app, 'wrong-tool-key', { tool: 'transactions.income.create', normalizedArgs: args });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('approval.invalid_args');
    });

    it('rejects an unregistered tool with tool.not_allowed', async () => {
      const { app, v2Store } = delegatedProposeApp();
      const before = v2Store.audit.length;
      const response = await propose(app, 'unknown-tool-key', { tool: 'transactions.transfer.create', normalizedArgs: expenseArgs() });
      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('tool.not_allowed');
      expect(v2Store.audit.length).toBe(before);
    });

    it('same key + same payload returns the existing operation (200, no second row)', async () => {
      const { app, v2Store } = delegatedProposeApp();
      const body = { tool: 'transactions.expense.create', normalizedArgs: expenseArgs() };
      const first = await propose(app, 'dedup-key', body);
      expect(first.statusCode).toBe(201);
      const second = await propose(app, 'dedup-key', body);
      expect(second.statusCode).toBe(200);
      expect(second.json().id).toBe(first.json().id);
      expect(second.json().existing).toBe(true);
      const created = v2Store.audit.filter((e) => e.event === 'propose');
      expect(new Set(created.map((e) => e.operationId)).size).toBe(1);
      const confirmed = await app.inject({ method: 'POST', url: `/pending-operations/v2/${first.json().id}/confirm` });
      expect(confirmed.statusCode).toBe(200);
    });

    it('same key + divergent payload conflicts with 409 idempotency.conflict', async () => {
      const { app } = delegatedProposeApp();
      const first = await propose(app, 'conflict-key', { tool: 'transactions.expense.create', normalizedArgs: expenseArgs() });
      expect(first.statusCode).toBe(201);
      const divergent = await propose(app, 'conflict-key', { tool: 'transactions.expense.create', normalizedArgs: { ...expenseArgs(), amountCents: 1 } });
      expect(divergent.statusCode).toBe(409);
      expect(divergent.json().code).toBe('idempotency.conflict');
    });
  });
});
