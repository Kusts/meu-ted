import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A, ACCOUNT_A1, CATEGORY_FOOD_A, TRANSACTIONS } from '../fixtures/seed.js';
import type { BetterAuth } from '../../src/auth/better-auth.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';

const mockAuth = {
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
      const auth = headers.get('authorization');
      if (auth === 'Bearer token-owner') return { user: { id: 'auth-owner-1', email: 'owner@shared.test' }, session: { id: 's-owner' } };
      if (auth === 'Bearer token-member') return { user: { id: 'auth-member-1', email: 'member@shared.test' }, session: { id: 's-member' } };
      return null;
    },
  },
  options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
} as unknown as BetterAuth;

const makeAccess = (role: 'owner' | 'member'): WorkspaceAccessStore => ({
  async resolve(authUserId, householdId) {
    if (householdId !== HOUSEHOLD_A) return undefined;
    if (authUserId === 'auth-owner-1') return { userId: 'user-owner-uuid', householdId, role: 'owner', kind: 'shared' };
    if (authUserId === 'auth-member-1') return { userId: 'user-member-uuid', householdId, role: 'member', kind: 'shared' };
    return undefined;
  },
});

describe('Mutual write permissions in shared workspace (RED -> GREEN)', () => {
  it('owner can create expense in shared workspace', async () => {
    const app = buildTestApp(
      { accounts: [ACCOUNT_A1], categories: [CATEGORY_FOOD_A], transactions: [] },
      undefined, undefined, mockAuth, undefined, undefined, makeAccess('owner')
    );
    await app.app.ready();
    const res = await app.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { 'x-workspace-id': HOUSEHOLD_A, authorization: 'Bearer token-owner', 'idempotency-key': 'mutual-owner-1' },
      payload: { description: 'Despesa Owner', amountCents: 1000, date: '2026-09-01', accountId: ACCOUNT_A1.id, categoryId: CATEGORY_FOOD_A.id },
    });
    expect(res.statusCode).toBe(201);
    await app.app.close();
  });

  it('member can also create expense in same shared workspace (mutual)', async () => {
    const app = buildTestApp(
      { accounts: [ACCOUNT_A1], categories: [CATEGORY_FOOD_A], transactions: [] },
      undefined, undefined, mockAuth, undefined, undefined, makeAccess('member')
    );
    await app.app.ready();
    const res = await app.app.inject({
      method: 'POST',
      url: '/transactions/expense',
      headers: { 'x-workspace-id': HOUSEHOLD_A, authorization: 'Bearer token-member', 'idempotency-key': 'mutual-member-1' },
      payload: { description: 'Despesa Member', amountCents: 2000, date: '2026-09-02', accountId: ACCOUNT_A1.id, categoryId: CATEGORY_FOOD_A.id },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.householdId).toBe(HOUSEHOLD_A);
    await app.app.close();
  });

  it('member can update and delete transaction (mutual write)', async () => {
    const existing = { ...TRANSACTIONS[0]!, householdId: HOUSEHOLD_A };
    const app = buildTestApp(
      { accounts: [ACCOUNT_A1], categories: [CATEGORY_FOOD_A], transactions: [existing] },
      undefined, undefined, mockAuth, undefined, undefined, makeAccess('member')
    );
    await app.app.ready();
    const patch = await app.app.inject({
      method: 'PATCH',
      url: `/transactions/${existing.id}`,
      headers: { 'x-workspace-id': HOUSEHOLD_A, authorization: 'Bearer token-member', 'idempotency-key': 'mutual-patch-1' },
      payload: { description: 'Updated by member' },
    });
    expect(patch.statusCode).toBe(200);
    const del = await app.app.inject({
      method: 'DELETE',
      url: `/transactions/${existing.id}`,
      headers: { 'x-workspace-id': HOUSEHOLD_A, authorization: 'Bearer token-member', 'idempotency-key': 'mutual-del-1' },
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().receipt.mutationKind).toBe('transaction.delete');
    await app.app.close();
  });
});
