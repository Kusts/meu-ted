import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-app.js';
import {
  HOUSEHOLD_A,
  HOUSEHOLD_B,
  ACCOUNT_A1,
  ACCOUNT_B1,
  CATEGORY_FOOD_A,
  CATEGORY_FOOD_B,
  TRANSACTIONS,
} from '../fixtures/seed.js';
import type { BetterAuth } from '../../src/auth/better-auth.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';
import type { Transaction } from '../../src/types/domain.js';

const TRANSACTION_B: Transaction = {
  id: '33333333-3333-4333-8333-333333333399',
  householdId: HOUSEHOLD_B,
  kind: 'expense',
  description: 'Despesa Exclusiva Workspace B',
  amountCents: 99_00,
  date: '2026-06-12',
  accountId: ACCOUNT_B1.id,
  categoryId: CATEGORY_FOOD_B.id,
};

const mockAuth = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      const authHeader = headers.get('authorization');
      if (authHeader === 'Bearer session-token-a') {
        return { user: { id: 'auth-user-a', email: 'user-a@example.com' }, session: { id: 's-a' } };
      }
      if (authHeader === 'Bearer session-token-b') {
        return { user: { id: 'auth-user-b', email: 'user-b@example.com' }, session: { id: 's-b' } };
      }
      return null;
    },
  },
  options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
} as unknown as BetterAuth;

const mockWorkspaceAccess: WorkspaceAccessStore = {
  async resolve(authUserId, householdId) {
    if (authUserId === 'auth-user-a' && householdId === HOUSEHOLD_A) {
      return { userId: 'user-a', householdId, role: 'owner', kind: 'personal' };
    }
    if (authUserId === 'auth-user-b' && householdId === HOUSEHOLD_B) {
      return { userId: 'user-b', householdId, role: 'owner', kind: 'personal' };
    }
    return undefined;
  },
};

describe('Cross-workspace isolation and authorization', () => {
  it('strictly isolates data and mutations between two workspaces when authenticated with valid session', async () => {
    const testApp = buildTestApp(
      {
        accounts: [ACCOUNT_A1, ACCOUNT_B1],
        categories: [CATEGORY_FOOD_A, CATEGORY_FOOD_B],
        transactions: [TRANSACTIONS[0]!, TRANSACTION_B],
      },
      undefined,
      undefined,
      mockAuth,
      undefined,
      undefined,
      mockWorkspaceAccess,
    );
    await testApp.app.ready();

    // 1. User A reads Workspace A
    const resA = await testApp.app.inject({
      method: 'GET',
      url: '/transactions',
      headers: {
        'x-workspace-id': HOUSEHOLD_A,
        authorization: 'Bearer session-token-a',
      },
    });
    expect(resA.statusCode).toBe(200);
    const itemsA = resA.json().items;
    expect(itemsA.length).toBe(1);
    expect(itemsA[0].householdId).toBe(HOUSEHOLD_A);
    expect(itemsA[0].id).toBe(TRANSACTIONS[0]!.id);

    // 2. User B reads Workspace B
    const resB = await testApp.app.inject({
      method: 'GET',
      url: '/transactions',
      headers: {
        'x-workspace-id': HOUSEHOLD_B,
        authorization: 'Bearer session-token-b',
      },
    });
    expect(resB.statusCode).toBe(200);
    const itemsB = resB.json().items;
    expect(itemsB.length).toBe(1);
    expect(itemsB[0].householdId).toBe(HOUSEHOLD_B);
    expect(itemsB[0].id).toBe(TRANSACTION_B.id);

    // 3. User B writes an expense in Workspace B
    const postB = await testApp.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: {
        'x-workspace-id': HOUSEHOLD_B,
        authorization: 'Bearer session-token-b',
        'idempotency-key': 'idem-write-workspace-b',
      },
      payload: {
        description: 'Nova Despesa B',
        amountCents: 120_00,
        date: '2026-06-15',
        accountId: ACCOUNT_B1.id,
        categoryId: CATEGORY_FOOD_B.id,
      },
    });
    expect(postB.statusCode).toBe(201);
    expect(postB.json().householdId).toBe(HOUSEHOLD_B);

    // 4. Verify User A still only sees Household A transactions, completely isolated from User B's new expense
    const resAAfter = await testApp.app.inject({
      method: 'GET',
      url: '/transactions',
      headers: {
        'x-workspace-id': HOUSEHOLD_A,
        authorization: 'Bearer session-token-a',
      },
    });
    expect(resAAfter.statusCode).toBe(200);
    const itemsAAfter = resAAfter.json().items;
    expect(itemsAAfter.length).toBe(1);
    expect(itemsAAfter.some((t: any) => t.description === 'Nova Despesa B')).toBe(false);

    await testApp.app.close();
  });

  it('rejects cross-workspace read when session is missing and device token is incompatible with x-workspace-id', async () => {
    const testApp = buildTestApp(
      {
        accounts: [ACCOUNT_A1, ACCOUNT_B1],
        categories: [CATEGORY_FOOD_A, CATEGORY_FOOD_B],
        transactions: [TRANSACTIONS[0]!, TRANSACTION_B],
      },
      undefined,
      undefined,
      mockAuth,
      undefined,
      undefined,
      mockWorkspaceAccess,
    );
    await testApp.app.ready();

    // Caller passes x-workspace-id for B, but dev-token-1 is for Household A and no session is provided
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/transactions',
      headers: {
        'x-workspace-id': HOUSEHOLD_B,
        'x-device-token': 'dev-token-1',
      },
    });

    // Must be rejected as 403 Forbidden without leaking Household A or DEMO data
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'auth.workspace_forbidden' });

    await testApp.app.close();
  });

  it('rejects cross-workspace access when user has session for Workspace A but requests Workspace B', async () => {
    const testApp = buildTestApp(
      {
        accounts: [ACCOUNT_A1, ACCOUNT_B1],
        categories: [CATEGORY_FOOD_A, CATEGORY_FOOD_B],
        transactions: [TRANSACTIONS[0]!, TRANSACTION_B],
      },
      undefined,
      undefined,
      mockAuth,
      undefined,
      undefined,
      mockWorkspaceAccess,
    );
    await testApp.app.ready();

    // User A attempts to access Workspace B
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/transactions',
      headers: {
        'x-workspace-id': HOUSEHOLD_B,
        authorization: 'Bearer session-token-a',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'auth.workspace_forbidden' });

    await testApp.app.close();
  });

  it('rejects cross-workspace mutation when session is missing and device token does not match requested workspace', async () => {
    const testApp = buildTestApp(
      {
        accounts: [ACCOUNT_A1, ACCOUNT_B1],
        categories: [CATEGORY_FOOD_A, CATEGORY_FOOD_B],
        transactions: [TRANSACTIONS[0]!],
      },
      undefined,
      undefined,
      mockAuth,
      undefined,
      undefined,
      mockWorkspaceAccess,
    );
    await testApp.app.ready();

    // Client attempts to mutate Workspace B with dev-token-1 (Household A)
    const mutationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: {
        'x-workspace-id': HOUSEHOLD_B,
        'x-device-token': 'dev-token-1',
        'idempotency-key': 'cross-workspace-mutation-test-rejected',
      },
      payload: {
        description: 'Mutação não autorizada',
        amountCents: 75_00,
        date: '2026-06-15',
        accountId: ACCOUNT_A1.id,
        categoryId: CATEGORY_FOOD_A.id,
      },
    });

    expect(mutationResponse.statusCode).toBe(403);
    expect(mutationResponse.json()).toMatchObject({ code: 'auth.workspace_forbidden' });

    // Verify Household A was NOT mutated
    const listA = await testApp.store.listAllTransactions(HOUSEHOLD_A);
    const leakedIntoA = listA.find((t) => t.description === 'Mutação não autorizada');
    expect(leakedIntoA).toBeUndefined();

    await testApp.app.close();
  });

  it('rejects with 401 when request specifies x-workspace-id but lacks any credentials (absence of credentials)', async () => {
    const testApp = buildTestApp(
      {
        accounts: [ACCOUNT_A1],
        transactions: [TRANSACTIONS[0]!],
      },
      undefined,
      undefined,
      mockAuth,
      undefined,
      undefined,
      mockWorkspaceAccess,
    );
    await testApp.app.ready();

    // No session token and no device token provided
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/transactions',
      headers: {
        'x-workspace-id': HOUSEHOLD_A,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'auth.session_required' });

    await testApp.app.close();
  });

  it('rejects with 403 when session is present but x-workspace-id is missing (eliminates non-deterministic fallback)', async () => {
    const workspaceStoreMock = {
      list: async () => [
        { id: HOUSEHOLD_A, name: 'Workspace A', kind: 'personal', role: 'owner', status: 'active' },
        { id: HOUSEHOLD_B, name: 'Workspace B', kind: 'shared', role: 'member', status: 'active' },
      ],
      create: async () => { throw new Error('not implemented'); },
      listMembers: async () => [],
    };

    const testApp = buildTestApp(
      {
        accounts: [ACCOUNT_A1, ACCOUNT_B1],
        transactions: [TRANSACTIONS[0]!, TRANSACTION_B],
      },
      undefined,
      undefined,
      mockAuth,
      undefined,
      undefined,
      mockWorkspaceAccess,
      undefined,
      undefined,
      workspaceStoreMock,
    );
    await testApp.app.ready();

    // Authenticated user with session, but client omitted x-workspace-id.
    // The API must NOT guess or pick the first active workspace non-deterministically; it must reject.
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/transactions',
      headers: {
        authorization: 'Bearer session-token-a',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'auth.workspace_required' });

    await testApp.app.close();
  });
});
