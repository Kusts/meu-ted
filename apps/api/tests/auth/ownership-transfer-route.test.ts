import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { OwnershipTransferStore } from '../../src/auth/ownership-transfers-postgres.js';

const route = readFileSync(new URL('../../src/auth/ownership-transfers-http.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../../src/auth/ownership-transfers-postgres.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../src/read-models/sql/V022__shared_workspace_invariants.sql', import.meta.url), 'utf8');

describe('ownership transfer authentication boundary', () => {
  it('accepts only through the authenticated Better Auth destination identity', () => {
    expect(route).toContain('authenticatedContext');
    expect(route).toContain('store.accept');
    expect(store).toContain('to_user_id = target.id');
    expect(store).toContain('target.auth_user_id = $3');
    expect(route).toContain('destinationAuthUserId: context.authUserId');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON ownership_transfers FROM PUBLIC');
    expect(store).toContain('set_ownership_transfer_context');
  });
});

describe('ownership transfer visibility and endpoints HTTP contract', () => {
  const HOUSEHOLD_A = '11111111-1111-4111-8111-111111111111';
  const HOUSEHOLD_B = '22222222-2222-4222-8222-222222222222';

  const mockTransfer = {
    id: '33333333-3333-4333-8333-333333333333',
    householdId: HOUSEHOLD_A,
    fromUserId: 'auth-owner-1',
    toUserId: 'auth-target-member-1',
    status: 'pending',
    createdAt: '2026-08-30T10:00:00.000Z',
  };

  const createAuth = (userId: string, email: string) => ({
    api: {
      getSession: async () => ({
        user: { id: userId, email },
        session: { id: `session-${userId}` },
      }),
    },
    options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
  } as unknown as ReturnType<typeof import('../../src/auth/better-auth.js').createBetterAuth>);

  const createWorkspaceAccess = (memberships: Array<{ authUserId: string; householdId: string; role: 'owner' | 'member' }>) => ({
    async resolve(authUserId: string, householdId: string) {
      const match = memberships.find((m) => m.authUserId === authUserId && m.householdId === householdId);
      if (!match) return undefined;
      return { userId: `uuid-${authUserId}`, householdId, role: match.role, kind: 'shared' as const };
    },
  });

  it('owner and destination member can view pending transfers, while unrelated member receives 403', async () => {
    const listPending = vi.fn(async ({ authUserId }: { householdId: string; authUserId: string }) => {
      if (authUserId === 'auth-owner-1' || authUserId === 'auth-target-member-1') {
        return [mockTransfer];
      }
      return [];
    });

    const storeMock = {
      create: vi.fn(),
      accept: vi.fn(),
      listPending,
    } as unknown as OwnershipTransferStore;

    const workspaceAccess = createWorkspaceAccess([
      { authUserId: 'auth-owner-1', householdId: HOUSEHOLD_A, role: 'owner' },
      { authUserId: 'auth-target-member-1', householdId: HOUSEHOLD_A, role: 'member' },
      { authUserId: 'auth-unrelated-member-1', householdId: HOUSEHOLD_A, role: 'member' },
    ]);

    // 1. Owner views pending transfer -> 200 OK
    const ownerApp = (await import('../test-app.js')).buildTestApp({}, undefined, undefined, createAuth('auth-owner-1', 'owner@example.com'), undefined, undefined, workspaceAccess, storeMock);
    await ownerApp.app.ready();
    const ownerRes = await ownerApp.app.inject({
      method: 'GET',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
    });
    expect(ownerRes.statusCode).toBe(200);
    expect(ownerRes.json()).toEqual({ items: [mockTransfer], total: 1 });
    await ownerApp.app.close();

    // 2. Destination member views pending transfer -> 200 OK
    const targetApp = (await import('../test-app.js')).buildTestApp({}, undefined, undefined, createAuth('auth-target-member-1', 'target@example.com'), undefined, undefined, workspaceAccess, storeMock);
    await targetApp.app.ready();
    const targetRes = await targetApp.app.inject({
      method: 'GET',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
    });
    expect(targetRes.statusCode).toBe(200);
    expect(targetRes.json()).toEqual({ items: [mockTransfer], total: 1 });
    await targetApp.app.close();

    // 3. Unrelated member receives 403
    const unrelatedApp = (await import('../test-app.js')).buildTestApp({}, undefined, undefined, createAuth('auth-unrelated-member-1', 'unrelated@example.com'), undefined, undefined, workspaceAccess, storeMock);
    await unrelatedApp.app.ready();
    const unrelatedRes = await unrelatedApp.app.inject({
      method: 'GET',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
    });
    expect(unrelatedRes.statusCode).toBe(403);
    expect(unrelatedRes.json()).toMatchObject({ code: 'auth.ownership_transfer_forbidden' });
    await unrelatedApp.app.close();
  });

  it('rejects cross-workspace and path divergence requests with 403', async () => {
    const storeMock = {
      create: vi.fn(),
      accept: vi.fn(),
      listPending: vi.fn(async () => [mockTransfer]),
    } as unknown as OwnershipTransferStore;

    const workspaceAccess = createWorkspaceAccess([
      { authUserId: 'auth-owner-1', householdId: HOUSEHOLD_A, role: 'owner' },
    ]);

    const ownerApp = (await import('../test-app.js')).buildTestApp({}, undefined, undefined, createAuth('auth-owner-1', 'owner@example.com'), undefined, undefined, workspaceAccess, storeMock);
    await ownerApp.app.ready();

    // Path divergence: path has HOUSEHOLD_B but x-workspace-id header has HOUSEHOLD_A
    const divergentRes = await ownerApp.app.inject({
      method: 'GET',
      url: `/workspaces/${HOUSEHOLD_B}/ownership-transfers`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
    });
    expect(divergentRes.statusCode).toBe(403);
    expect(divergentRes.json()).toMatchObject({ code: 'auth.forbidden' });

    // Path divergence on POST create
    const divergentPost = await ownerApp.app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_B}/ownership-transfers`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
      payload: { toUserId: 'auth-target-1' },
    });
    expect(divergentPost.statusCode).toBe(403);

    // Path divergence on POST accept
    const divergentAccept = await ownerApp.app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_B}/ownership-transfers/${mockTransfer.id}/accept`,
      headers: { 'x-workspace-id': HOUSEHOLD_A },
    });
    expect(divergentAccept.statusCode).toBe(403);

    await ownerApp.app.close();
  });
});

describe('Postgres OwnershipTransferStore transaction and client scoping', () => {
  const HOUSEHOLD_ID = '11111111-1111-4111-8111-111111111111';
  const FROM_AUTH_USER_ID = 'auth-owner-1';
  const TO_AUTH_USER_ID = 'auth-target-1';
  const TRANSFER_ID = '33333333-3333-4333-8333-333333333333';

  const makeMockPool = () => {
    const clientQueries: string[] = [];
    const poolQueries: string[] = [];

    const mockClient = {
      query: vi.fn(async (text: string) => {
        clientQueries.push(text);
        if (text.includes('SELECT id FROM users')) {
          return { rows: [{ id: 'uuid-user-1' }], rowCount: 1 };
        }
        if (text.includes('INSERT INTO ownership_transfers')) {
          return {
            rows: [{
              id: TRANSFER_ID,
              household_id: HOUSEHOLD_ID,
              from_user_id: 'uuid-user-1',
              to_user_id: 'uuid-target-1',
              status: 'pending',
              created_at: new Date('2026-08-30T10:00:00.000Z'),
            }],
            rowCount: 1,
          };
        }
        if (text.includes('UPDATE ownership_transfers')) {
          return {
            rows: [{
              id: TRANSFER_ID,
              household_id: HOUSEHOLD_ID,
              from_user_id: 'uuid-user-1',
              to_user_id: 'uuid-target-1',
              status: 'accepted',
              accepted_at: new Date('2026-08-30T11:00:00.000Z'),
            }],
            rowCount: 1,
          };
        }
        if (text.includes('SELECT transfer.id')) {
          return {
            rows: [{
              id: TRANSFER_ID,
              household_id: HOUSEHOLD_ID,
              from_user_id: FROM_AUTH_USER_ID,
              to_user_id: TO_AUTH_USER_ID,
              status: 'pending',
              created_at: new Date('2026-08-30T10:00:00.000Z'),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn(async () => mockClient),
      query: vi.fn(async (text: string) => {
        poolQueries.push(text);
        return { rows: [], rowCount: 1 };
      }),
    };

    return { mockPool: mockPool as any, mockClient, clientQueries, poolQueries };
  };

  it('executes create entirely on the transaction client without leaking queries to pool.query', async () => {
    const { createPostgresOwnershipTransferStore } = await import('../../src/auth/ownership-transfers-postgres.js');
    const { mockPool, clientQueries, poolQueries } = makeMockPool();
    const store = createPostgresOwnershipTransferStore(mockPool, 'app_trusted_role');

    const result = (await store.create({
      householdId: HOUSEHOLD_ID,
      fromAuthUserId: FROM_AUTH_USER_ID,
      toAuthUserId: TO_AUTH_USER_ID,
    })) as any;

    expect(result.id).toBe(TRANSFER_ID);
    expect(poolQueries).toHaveLength(0);

    expect(clientQueries).toEqual([
      'BEGIN',
      'SET LOCAL ROLE "app_trusted_role"',
      'SELECT id FROM users WHERE auth_user_id = $1',
      'SELECT set_ownership_transfer_context($1::uuid)',
      expect.stringContaining('INSERT INTO ownership_transfers'),
      'COMMIT',
    ]);
  });

  it('executes accept entirely on the transaction client without leaking queries to pool.query', async () => {
    const { createPostgresOwnershipTransferStore } = await import('../../src/auth/ownership-transfers-postgres.js');
    const { mockPool, clientQueries, poolQueries } = makeMockPool();
    const store = createPostgresOwnershipTransferStore(mockPool, 'app_trusted_role');

    const result = (await store.accept({
      householdId: HOUSEHOLD_ID,
      transferId: TRANSFER_ID,
      destinationAuthUserId: TO_AUTH_USER_ID,
    })) as any;

    expect(result.id).toBe(TRANSFER_ID);
    expect(poolQueries).toHaveLength(0);

    expect(clientQueries).toEqual([
      'BEGIN',
      'SET LOCAL ROLE "app_trusted_role"',
      'SELECT id FROM users WHERE auth_user_id = $1',
      'SELECT set_ownership_transfer_context($1::uuid)',
      expect.stringContaining('UPDATE ownership_transfers'),
      'COMMIT',
    ]);
  });

  it('executes listPending entirely on the transaction client without leaking queries to pool.query', async () => {
    const { createPostgresOwnershipTransferStore } = await import('../../src/auth/ownership-transfers-postgres.js');
    const { mockPool, clientQueries, poolQueries } = makeMockPool();
    const store = createPostgresOwnershipTransferStore(mockPool, 'app_trusted_role');

    const items = await store.listPending({
      householdId: HOUSEHOLD_ID,
      authUserId: FROM_AUTH_USER_ID,
    });

    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(TRANSFER_ID);
    expect(poolQueries).toHaveLength(0);

    expect(clientQueries).toEqual([
      'BEGIN',
      'SET LOCAL ROLE "app_trusted_role"',
      'SELECT id FROM users WHERE auth_user_id = $1',
      'SELECT set_ownership_transfer_context($1::uuid)',
      expect.stringContaining('SELECT transfer.id'),
      'COMMIT',
    ]);
  });
});
