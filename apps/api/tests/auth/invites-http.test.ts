import Fastify from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { createInMemoryInviteStore, createInviteService } from '../../src/auth/invites.js';
import { buildTestApp } from '../test-app.js';

const householdId = '11111111-1111-4111-8111-111111111111';

const signUp = async (app: ReturnType<typeof Fastify>, email: string) => {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/sign-up/email',
    headers: { origin: 'http://localhost:3000' },
    payload: { email, password: 'test-password-123', name: email.split('@')[0] },
  });
  const rawCookie = response.headers['set-cookie'];
  return {
    user: response.json().user as { id: string; email: string },
    cookie: Array.isArray(rawCookie) ? rawCookie.join('; ') : String(rawCookie ?? ''),
  };
};

describe('invite HTTP flow', () => {
  it('delivers an invite and accepts it for an existing session user', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const store = createInMemoryInviteStore({ users: [] });
    const deliveries: Array<{ token: string }> = [];
    const service = createInviteService({
      store,
      deliver: async (message) => { deliveries.push({ token: message.token }); },
    });
    const { app } = buildTestApp({}, undefined, undefined, auth, service, async () => true);

    try {
      const owner = await signUp(app, 'owner@example.com');
      const member = await signUp(app, 'member@example.com');
      store.addUser(member.user);

      const create = await app.inject({
        method: 'POST',
        url: '/auth/invites',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie, 'idempotency-key': 'create-key-1' },
        payload: { householdId, email: ' MEMBER@EXAMPLE.COM ', role: 'member', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      const accepts = await Promise.all([
        app.inject({
          method: 'POST',
          url: '/auth/invites/accept',
          headers: { origin: 'http://localhost:3000', cookie: member.cookie },
          payload: { token: deliveries[0]!.token },
        }),
        app.inject({
          method: 'POST',
          url: '/auth/invites/accept',
          headers: { origin: 'http://localhost:3000', cookie: member.cookie },
          payload: { token: deliveries[0]!.token },
        }),
      ]);

      expect(create.statusCode).toBe(201);
      expect(deliveries).toHaveLength(1);
      expect(accepts.map((response) => response.statusCode).sort()).toEqual([200, 409]);
      expect(store.listMemberships()).toHaveLength(1);
    } finally {
      await app.close();
      await auth.close();
    }
  });

  it('rejects POST /auth/invites without Idempotency-Key and replays safely on duplicate key without second email delivery', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const store = createInMemoryInviteStore({ users: [] });
    const deliveries: Array<{ token: string; email: string }> = [];
    const service = createInviteService({
      store,
      deliver: async (message) => { deliveries.push({ token: message.token, email: message.email }); },
    });
    const { app } = buildTestApp({}, undefined, undefined, auth, service, async () => true);

    try {
      const owner = await signUp(app, 'owner@example.com');

      // 1. Without Idempotency-Key returns 400
      const noKey = await app.inject({
        method: 'POST',
        url: '/auth/invites',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie },
        payload: { householdId, email: 'idemp.member@example.com', role: 'member', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      expect(noKey.statusCode).toBe(400);
      expect(deliveries).toHaveLength(0);

      // 2. First request with Idempotency-Key succeeds with 201 and 1 delivery
      const first = await app.inject({
        method: 'POST',
        url: '/auth/invites',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie, 'idempotency-key': 'idemp-invite-create-key' },
        payload: { householdId, email: 'idemp.member@example.com', role: 'member', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      expect(first.statusCode).toBe(201);
      expect(deliveries).toHaveLength(1);
      const firstBody = first.json();

      // 3. Second request with identical Idempotency-Key and payload returns replayed response without second delivery
      const second = await app.inject({
        method: 'POST',
        url: '/auth/invites',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie, 'idempotency-key': 'idemp-invite-create-key' },
        payload: { householdId, email: 'idemp.member@example.com', role: 'member', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      expect(second.statusCode).toBe(201);
      expect(second.headers['idempotent-replayed']).toBe('true');
      expect(second.json()).toEqual(firstBody);
      expect(deliveries).toHaveLength(1); // No second email delivery!
    } finally {
      await app.close();
      await auth.close();
    }
  });

  it('rejects acceptance with a different authenticated email', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const store = createInMemoryInviteStore({ users: [] });
    const deliveries: Array<{ token: string }> = [];
    const service = createInviteService({
      store,
      deliver: async (message) => { deliveries.push({ token: message.token }); },
    });
    const { app } = buildTestApp({}, undefined, undefined, auth, service, async () => true);

    try {
      const owner = await signUp(app, 'owner@example.com');
      const member = await signUp(app, 'member@example.com');
      store.addUser(owner.user);
      store.addUser(member.user);

      await app.inject({
        method: 'POST',
        url: '/auth/invites',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie, 'idempotency-key': 'create-key-2' },
        payload: { householdId, email: ' MEMBER@EXAMPLE.COM ', role: 'member', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      const accept = await app.inject({
        method: 'POST',
        url: '/auth/invites/accept',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie },
        payload: { token: deliveries[0]!.token },
      });

      expect(accept.statusCode).toBe(403);
      expect(accept.json()).toMatchObject({ code: 'invite.email_mismatch' });
      expect(store.listMemberships()).toHaveLength(0);
    } finally {
      await app.close();
      await auth.close();
    }
  });

  it('owner lists pending invites without sensitive tokens, while unauthenticated/non-owner receives 401/403', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const store = createInMemoryInviteStore({ users: [] });
    const deliveries: Array<{ token: string }> = [];
    const service = createInviteService({
      store,
      deliver: async (message) => { deliveries.push({ token: message.token }); },
    });

    const otherHousehold = '22222222-2222-4222-8222-222222222222';
    let ownerUserId = '';
    let otherOwnerUserId = '';

    const { app } = buildTestApp(
      {},
      undefined,
      undefined,
      auth,
      service,
      async (input?: { userId?: string; householdId?: string }) => {
        if (!input || !input.userId) return false;
        if (input.householdId === householdId && input.userId === ownerUserId) return true;
        if (input.householdId === otherHousehold && input.userId === otherOwnerUserId) return true;
        return false;
      },
    );

    try {
      const owner = await signUp(app, 'owner@example.com');
      const member = await signUp(app, 'member@example.com');
      const otherOwner = await signUp(app, 'otherowner@example.com');
      ownerUserId = owner.user.id;
      otherOwnerUserId = otherOwner.user.id;

      // Create invite in householdId
      await app.inject({
        method: 'POST',
        url: '/auth/invites',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie, 'idempotency-key': 'create-key-3' },
        payload: { householdId, email: 'pending.member@example.com', role: 'member', expiresAt: '2030-01-01T00:00:00.000Z' },
      });

      // 1. Unauthenticated GET returns 401
      const unauth = await app.inject({
        method: 'GET',
        url: `/workspaces/${householdId}/invites`,
      });
      expect(unauth.statusCode).toBe(401);

      // 2. Member (non-owner) GET returns 403
      const nonOwner = await app.inject({
        method: 'GET',
        url: `/workspaces/${householdId}/invites`,
        headers: { origin: 'http://localhost:3000', cookie: member.cookie },
      });
      expect(nonOwner.statusCode).toBe(403);

      // 3. Other workspace owner GET returns 403 for householdId
      const crossOwner = await app.inject({
        method: 'GET',
        url: `/workspaces/${householdId}/invites`,
        headers: { origin: 'http://localhost:3000', cookie: otherOwner.cookie },
      });
      expect(crossOwner.statusCode).toBe(403);

      // 4. Workspace Owner GET returns 200 with list
      const ownerGet = await app.inject({
        method: 'GET',
        url: `/workspaces/${householdId}/invites`,
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie },
      });
      expect(ownerGet.statusCode).toBe(200);
      const body = ownerGet.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].email).toBe('pending.member@example.com');
      expect(body.items[0].householdId).toBe(householdId);
      // Zero secrets in payload
      expect(body.items[0].token).toBeUndefined();
      expect(body.items[0].tokenHash).toBeUndefined();
    } finally {
      await app.close();
      await auth.close();
    }
  });

  it('owner revokes a pending invite with Idempotency-Key, blocking subsequent acceptance and listing', async () => {
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      disableSignUp: false,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    const store = createInMemoryInviteStore({ users: [] });
    const deliveries: Array<{ token: string; inviteId: string }> = [];
    const service = createInviteService({
      store,
      deliver: async (message) => { deliveries.push({ token: message.token, inviteId: message.inviteId }); },
    });
    const { app } = buildTestApp({}, undefined, undefined, auth, service, async (input?: { householdId?: string }) => input?.householdId === householdId);

    try {
      const owner = await signUp(app, 'owner@example.com');
      const member = await signUp(app, 'member@example.com');
      store.addUser(member.user);

      // 1. Create invite
      const createRes = await app.inject({
        method: 'POST',
        url: '/auth/invites',
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie, 'idempotency-key': 'create-key-4' },
        payload: { householdId, email: 'member@example.com', role: 'member', expiresAt: '2030-01-01T00:00:00.000Z' },
      });
      const inviteId = createRes.json().inviteId;
      const inviteToken = deliveries[0]!.token;

      // 2. Revoke without Idempotency-Key returns 400
      const noIdemp = await app.inject({
        method: 'DELETE',
        url: `/workspaces/${householdId}/invites/${inviteId}`,
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie },
      });
      expect(noIdemp.statusCode).toBe(400);

      // 3. Revoke with Idempotency-Key returns 200/204
      const revoke1 = await app.inject({
        method: 'DELETE',
        url: `/workspaces/${householdId}/invites/${inviteId}`,
        headers: {
          origin: 'http://localhost:3000',
          cookie: owner.cookie,
          'idempotency-key': 'test-revoke-key-1',
        },
      });
      expect([200, 204]).toContain(revoke1.statusCode);

      // 4. Replay with same Idempotency-Key returns replayed response
      const revoke2 = await app.inject({
        method: 'DELETE',
        url: `/workspaces/${householdId}/invites/${inviteId}`,
        headers: {
          origin: 'http://localhost:3000',
          cookie: owner.cookie,
          'idempotency-key': 'test-revoke-key-1',
        },
      });
      expect([200, 204]).toContain(revoke2.statusCode);
      expect(revoke2.headers['idempotent-replayed']).toBe('true');

      // 5. Listing pending invites shows 0 items
      const listRes = await app.inject({
        method: 'GET',
        url: `/workspaces/${householdId}/invites`,
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie },
      });
      expect(listRes.json().items).toHaveLength(0);

      // 6. Attempting to accept revoked invite returns 410 (invite.revoked)
      const acceptRes = await app.inject({
        method: 'POST',
        url: '/auth/invites/accept',
        headers: { origin: 'http://localhost:3000', cookie: member.cookie },
        payload: { token: inviteToken },
      });
      expect(acceptRes.statusCode).toBe(410);
      expect(acceptRes.json().code).toBe('invite.revoked');
    } finally {
      await app.close();
      await auth.close();
    }
  });
});
