import { describe, expect, it, vi } from 'vitest';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A, TRANSACTIONS } from '../fixtures/seed.js';
import type { createBetterAuth } from '../../src/auth/better-auth.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';
import type { OwnershipTransferStore } from '../../src/auth/ownership-transfers-postgres.js';

const authSession = {
  api: {
    getSession: async () => ({
      user: { id: 'auth-member-1', email: 'member@example.test' },
      session: { id: 'session-1' },
    }),
  },
  options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
} as unknown as ReturnType<typeof createBetterAuth>;

describe('workspace membership access', () => {
  it('new member sees existing history, then removal is forbidden immediately', async () => {
    let active = true;
    let resolveCalls = 0;
    const workspaceAccess: WorkspaceAccessStore = {
      async resolve(authUserId, householdId) {
        resolveCalls += 1;
        if (active && authUserId === 'auth-member-1' && householdId === HOUSEHOLD_A) {
          return { userId: 'member-uuid-1', householdId, role: 'member', kind: 'shared' };
        }
        return undefined;
      },
    };
    const testApp = buildTestApp({ transactions: [TRANSACTIONS[0]!] }, undefined, undefined, authSession, undefined, undefined, workspaceAccess);
    testApp.app.get('/_context-check', async (request) => request.authenticatedContext);
    await testApp.app.ready();

    const headers = { 'x-workspace-id': HOUSEHOLD_A };
    const beforeRemoval = await testApp.app.inject({ method: 'GET', url: '/transactions', headers });
    expect(beforeRemoval.statusCode).toBe(200);
    expect(beforeRemoval.json().items).toHaveLength(1);
    const contextResponse = await testApp.app.inject({ method: 'GET', url: '/_context-check', headers });
    expect(contextResponse.statusCode).toBe(200);
    expect(contextResponse.json()).toEqual(expect.objectContaining({ householdId: HOUSEHOLD_A, actorType: 'user', role: 'member' }));
    expect(resolveCalls).toBe(2);

    active = false;
    const afterRemoval = await testApp.app.inject({ method: 'GET', url: '/transactions', headers });
    expect(afterRemoval.statusCode).toBe(403);
    expect(afterRemoval.json()).toMatchObject({ code: 'auth.workspace_forbidden' });
    expect(resolveCalls).toBe(3);

    await testApp.app.close();
  });

  it('rejects ownership creation for a resolved member role', async () => {
    let resolveCalls = 0;
    const workspaceAccess: WorkspaceAccessStore = {
      async resolve(authUserId, householdId) {
        resolveCalls += 1;
        if (authUserId !== 'auth-member-1' || householdId !== HOUSEHOLD_A) return undefined;
        return { userId: 'member-uuid-1', householdId, role: 'member', kind: 'shared' };
      },
    };
    const create = vi.fn();
    const ownershipTransfers = { create, accept: vi.fn() } as unknown as OwnershipTransferStore;
    const testApp = buildTestApp({}, undefined, undefined, authSession, undefined, undefined, workspaceAccess, ownershipTransfers);
    await testApp.app.ready();

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
      payload: { toUserId: 'auth-target-1' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'auth.workspace_role_forbidden' });
    expect(create).not.toHaveBeenCalled();
    expect(resolveCalls).toBe(1);
    await testApp.app.close();
  });

  it('ownership handler consumes resolved context, not route scope or session lookup', async () => {
    let resolveCalls = 0;
    const workspaceAccess: WorkspaceAccessStore = {
      async resolve(authUserId, householdId) {
        resolveCalls += 1;
        if (authUserId !== 'auth-member-1' || householdId !== HOUSEHOLD_A) return undefined;
        return { userId: 'owner-uuid-1', householdId, role: 'owner', kind: 'shared' };
      },
    };
    const create = vi.fn(async (input) => ({ id: 'transfer-1', ...input }));
    const ownershipTransfers = { create, accept: vi.fn() } as unknown as OwnershipTransferStore;
    const testApp = buildTestApp({}, undefined, undefined, authSession, undefined, undefined, workspaceAccess, ownershipTransfers);
    await testApp.app.ready();

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
      payload: { toUserId: 'auth-target-1' },
    });

    expect(response.statusCode).toBe(201);
    expect(create).toHaveBeenCalledWith({
      householdId: HOUSEHOLD_A,
      fromAuthUserId: 'auth-member-1',
      toAuthUserId: 'auth-target-1',
    });
    expect(resolveCalls).toBe(1);
    await testApp.app.close();
  });
});
