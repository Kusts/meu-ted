import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../test-app.js';
import { HOUSEHOLD_A } from '../fixtures/seed.js';
import type { DeviceTokenStore } from '../../src/auth/device-token.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';
import type { WorkspaceStore, WorkspaceSummary } from '../../src/auth/workspaces-store.js';
import type { OwnershipTransferStore } from '../../src/auth/ownership-transfers-postgres.js';
import type { createBetterAuth } from '../../src/auth/better-auth.js';

type UserStatus = 'active' | 'disabled';
type WorkspaceStatus = 'active' | 'archived';

type FixtureState = {
  users: Map<string, UserStatus>;
  memberships: Map<string, 'owner' | 'member'>;
  workspaces: Map<string, WorkspaceStatus>;
  tokens: Map<string, { deviceId: string; householdId: string; userId: string | null }>;
};

const OWNER = 'auth-owner-1';
const MEMBER = 'auth-member-1';
const REMOVED = 'auth-removed-1';
const DISABLED = 'auth-disabled-1';
const NOWORKSPACE = 'auth-lonely-1';

const membershipKey = (userId: string, workspaceId: string): string => `${userId}:${workspaceId}`;

const seedState = (): FixtureState => ({
  users: new Map<string, UserStatus>([
    [OWNER, 'active'],
    [MEMBER, 'active'],
    [REMOVED, 'active'],
    [DISABLED, 'disabled'],
    [NOWORKSPACE, 'active'],
  ]),
  memberships: new Map<string, 'owner' | 'member'>([
    [membershipKey(OWNER, HOUSEHOLD_A), 'owner'],
    [membershipKey(MEMBER, HOUSEHOLD_A), 'member'],
    [membershipKey(DISABLED, HOUSEHOLD_A), 'member'],
  ]),
  workspaces: new Map<string, WorkspaceStatus>([[HOUSEHOLD_A, 'active']]),
  tokens: new Map([
    ['owner-device-token', { deviceId: 'device-owner-1', householdId: HOUSEHOLD_A, userId: OWNER }],
    ['member-device-token', { deviceId: 'device-member-1', householdId: HOUSEHOLD_A, userId: MEMBER }],
    ['removed-device-token', { deviceId: 'device-removed-1', householdId: HOUSEHOLD_A, userId: REMOVED }],
    ['disabled-device-token', { deviceId: 'device-disabled-1', householdId: HOUSEHOLD_A, userId: DISABLED }],
  ]),
});

const stubWorkspaceAccess = (state: FixtureState): WorkspaceAccessStore => ({
  resolve: async (authUserId: string, householdId: string) => {
    if (state.users.get(authUserId) !== 'active') return undefined;
    const role = state.memberships.get(membershipKey(authUserId, householdId));
    if (!role) return undefined;
    return { userId: `uuid-${authUserId}`, householdId, role, kind: 'shared' as const };
  },
});

const stubTokenStore = (state: FixtureState): DeviceTokenStore => ({
  resolve: async (token: string | undefined) => {
    if (!token || token.trim() === '') {
      throw Object.assign(new Error('missing device token'), { statusCode: 401, code: 'auth.missing_token' });
    }
    const record = state.tokens.get(token);
    if (!record) {
      throw Object.assign(new Error('invalid or revoked device token'), { statusCode: 401, code: 'auth.invalid_token' });
    }
    return { deviceId: record.deviceId, householdId: record.householdId, userId: record.userId };
  },
  register: async (deviceName: string, householdId: string, opts?: { userId?: string }) => {
    const token = `token-${deviceName}-${state.tokens.size}`;
    const deviceId = `device-${deviceName}-${state.tokens.size}`;
    state.tokens.set(token, { deviceId, householdId, userId: opts?.userId ?? null });
    return { token, deviceId, householdId };
  },
  revoke: async (token: string) => {
    state.tokens.delete(token);
  },
  revokeAllForUserWorkspace: async (userId: string, householdId: string) => {
    let revoked = 0;
    for (const [token, record] of state.tokens) {
      if (record.userId === userId && record.householdId === householdId) {
        state.tokens.delete(token);
        revoked += 1;
      }
    }
    return revoked;
  },
  rotate: async (currentToken: string | undefined, deviceName: string, householdId: string, opts?: { userId?: string }) => {
    if (typeof currentToken === 'string' && currentToken.trim() !== '') {
      const prev = state.tokens.get(currentToken);
      if (!prev) {
        throw Object.assign(new Error('invalid or revoked device token'), { statusCode: 401, code: 'auth.invalid_token' });
      }
    }
    const token = `token-${deviceName}-${state.tokens.size}`;
    const deviceId = `device-${deviceName}-${state.tokens.size}`;
    state.tokens.set(token, { deviceId, householdId, userId: opts?.userId ?? null });
    return { token, deviceId, householdId };
  },
});

const stubWorkspaceStore = (state: FixtureState): WorkspaceStore => {
  const toSummary = (id: string, authUserId: string): WorkspaceSummary => ({
    id,
    name: `workspace-${id.slice(0, 8)}`,
    kind: 'shared',
    role: state.memberships.get(membershipKey(authUserId, id)) ?? 'member',
    status: state.workspaces.get(id) ?? 'active',
  });
  return {
    list: async (authUserId: string) => {
      const ids: string[] = [];
      for (const key of state.memberships.keys()) {
        const [userId, workspaceId] = key.split(':');
        if (userId === authUserId && workspaceId && !ids.includes(workspaceId)) ids.push(workspaceId);
      }
      return ids.map((id) => toSummary(id, authUserId));
    },
    create: async () => { throw new Error('not implemented in fixture'); },
    rename: async () => { throw new Error('not implemented in fixture'); },
    setStatus: async () => { throw new Error('not implemented in fixture'); },
    listMembers: async () => [],
    removeMember: async () => undefined,
    leave: async () => undefined,
  };
};

const stubTransfers = (): OwnershipTransferStore => ({
  create: async (input: { householdId: string; fromAuthUserId: string; toAuthUserId: string }) => ({
    id: '33333333-3333-4333-8333-333333333333',
    householdId: input.householdId,
    fromUserId: input.fromAuthUserId,
    toUserId: input.toAuthUserId,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }),
  accept: async () => { throw new Error('not implemented in fixture'); },
  listPending: async () => [],
}) as unknown as OwnershipTransferStore;

type StubAuth = ReturnType<typeof createBetterAuth>;

const missingSessionAuth = {
  api: { getSession: async () => null },
  options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
} as unknown as StubAuth;

const sessionAuth = (userId: string): StubAuth => ({
  api: {
    getSession: async () => ({
      user: { id: userId, email: `${userId}@example.test` },
      session: { id: `session-${userId}` },
    }),
  },
  options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
}) as unknown as StubAuth;

const buildDeviceApp = (state: FixtureState, sessionUserId?: string) =>
  buildTestApp(
    {},
    sessionUserId ? sessionAuth(sessionUserId) : missingSessionAuth,
    stubWorkspaceAccess(state),
    stubTokenStore(state),
    stubWorkspaceStore(state),
    stubTransfers(),
  );

const deviceHeaders = (token: string): Record<string, string> => ({
  'x-device-token': token,
  'x-workspace-id': HOUSEHOLD_A,
});

describe('V4.1 Task 1.1 — device token authorization hardening (RED)', () => {
  it('valid device token + removed membership → 403 workspace_forbidden', async () => {
    const { app } = buildDeviceApp(seedState());
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/accounts', headers: deviceHeaders('removed-device-token') });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.workspace_forbidden');
    await app.close();
  });

  it('valid device token + disabled user → 403 workspace_forbidden', async () => {
    const { app } = buildDeviceApp(seedState());
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/accounts', headers: deviceHeaders('disabled-device-token') });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.workspace_forbidden');
    await app.close();
  });

  it('valid device token + archived workspace → 403 workspace_forbidden', async () => {
    const state = seedState();
    state.workspaces.set(HOUSEHOLD_A, 'archived');
    const { app } = buildDeviceApp(state);
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/accounts', headers: deviceHeaders('member-device-token') });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.workspace_forbidden');
    await app.close();
  });

  it('member device token never carries owner role (view transfers with empty list → 403)', async () => {
    const { app } = buildDeviceApp(seedState());
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: deviceHeaders('member-device-token'),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.ownership_transfer_forbidden');
    await app.close();
  });

  it('member device token cannot create ownership transfer (403 role forbidden)', async () => {
    const { app } = buildDeviceApp(seedState());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { ...deviceHeaders('member-device-token'), 'content-type': 'application/json' },
      payload: { toUserId: MEMBER },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('auth.workspace_role_forbidden');
    await app.close();
  });

  it('owner device token keeps the real owner role (create transfer → 201)', async () => {
    const { app } = buildDeviceApp(seedState());
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { ...deviceHeaders('owner-device-token'), 'content-type': 'application/json' },
      payload: { toUserId: MEMBER },
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it('ownership transfer is reflected on the next request (member → owner)', async () => {
    const state = seedState();
    const { app } = buildDeviceApp(state);
    await app.ready();
    const before = await app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { ...deviceHeaders('member-device-token'), 'content-type': 'application/json' },
      payload: { toUserId: MEMBER },
    });
    expect(before.statusCode).toBe(403);
    state.memberships.set(membershipKey(MEMBER, HOUSEHOLD_A), 'owner');
    const after = await app.inject({
      method: 'POST',
      url: `/workspaces/${HOUSEHOLD_A}/ownership-transfers`,
      headers: { ...deviceHeaders('member-device-token'), 'content-type': 'application/json' },
      payload: { toUserId: MEMBER },
    });
    expect(after.statusCode).toBe(201);
    await app.close();
  });

  it('device registration with zero workspaces is rejected in production, never assigned to demo/default', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { app } = buildDeviceApp(seedState(), NOWORKSPACE);
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/devices/register',
        headers: { 'content-type': 'application/json' },
        payload: { deviceName: 'Lonely Device' },
      });
      expect([400, 403, 422]).toContain(res.statusCode);
      expect(res.json().token).toBeUndefined();
      await app.close();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('device registration fallback stays available outside production (dev/test gate)', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const { app } = buildDeviceApp(seedState(), NOWORKSPACE);
      await app.ready();
      const res = await app.inject({
        method: 'POST',
        url: '/auth/devices/register',
        headers: { 'content-type': 'application/json' },
        payload: { deviceName: 'Dev Device' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().householdId).toBeDefined();
      await app.close();
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const describeIfDb = ENABLED ? describe : describe.skip;

if (!ENABLED) {
  console.log(
    '[device-authorization] SKIP: DATABASE_URL_TEST + DB_TEST_MARKER are required for the Postgres authorized-resolution test.',
  );
}

describeIfDb('V4.1 Task 1.1 — authorized device resolution against real Postgres', () => {
  it('token owner lineage from the real store drives membership resolution', async () => {
    const { createPool } = await import('../../src/db/pool.js');
    const { requireTestDatabase } = await import('../../src/db/db-guard.js');
    const { runMigrations } = await import('../../src/read-models/sql/migrate.js');
    const { createPostgresDeviceTokenStore } = await import('../../src/auth/device-token.js');
    const { resolveAuthorizedDevice } = await import('../../src/auth/device-access.js');
    const pool = createPool({ connectionString: DB_URL!, max: 2 });
    try {
      await requireTestDatabase(pool, 'device-authorization');
      await runMigrations(pool);
      const tokenStore = createPostgresDeviceTokenStore(pool);
      const workspaceId = '00000000-0000-4000-8000-0000000000a1';
      const ownerId = '00000000-0000-4000-8000-00000000b001';
      // Production invariant: a session only exists for a real user, so the
      // users row exists before register resolves the lineage to users.id.
      // users.auth_user_id FKs to "user"(id), so seed both identities.
      await pool.query(`DELETE FROM users WHERE id = $1 OR auth_user_id = $2`, [ownerId, ownerId]);
      await pool.query(`DELETE FROM "user" WHERE id = $1 OR email = $2`, [ownerId, 'it-owner@example.test']);
      await pool.query(
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ($1::uuid, 'it-owner', 'it-owner@example.test', TRUE, NOW(), NOW())`,
        [ownerId],
      );
      await pool.query(
        `INSERT INTO users (id, auth_user_id, email, name, status)
         VALUES ($1, $2, 'it-owner@example.test', 'it-owner', 'active')`,
        [ownerId, ownerId],
      );
      const created = await tokenStore.register('pg-auth-device', workspaceId, { userId: ownerId });
      const seen: Array<{ authUserId: string; householdId: string }> = [];
      const workspaceAccess: WorkspaceAccessStore = {
        resolve: async (authUserId: string, householdId: string) => {
          seen.push({ authUserId, householdId });
          return { userId: `uuid-${authUserId}`, householdId, role: 'member', kind: 'shared' as const };
        },
      };
      const authorized = await resolveAuthorizedDevice({ tokenStore, workspaceAccess }, created.token, workspaceId);
      expect(seen).toEqual([{ authUserId: ownerId, householdId: workspaceId }]);
      expect(authorized.access.role).toBe('member');
      expect(authorized.userId).toBe(ownerId);
      await pool.query('DELETE FROM device_tokens WHERE device_id = $1', [created.deviceId]).catch(() => undefined);
      await pool.query('DELETE FROM users WHERE id = $1', [ownerId]).catch(() => undefined);
      await pool.query('DELETE FROM "user" WHERE id = $1', [ownerId]).catch(() => undefined);
    } finally {
      await pool.end();
    }
  });
});
