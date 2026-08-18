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
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie },
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
        headers: { origin: 'http://localhost:3000', cookie: owner.cookie },
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
});
