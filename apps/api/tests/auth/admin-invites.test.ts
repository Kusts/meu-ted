import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryReadModelStoreFromState } from '../../src/read-models/store.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryIdempotencyStore } from '../../src/writes/idempotency.js';
import type { AdminInviteDeliveryMessage } from '../../src/auth/admin-invite-service.js';

describe('Admin Invite API (POST /admin/invite)', () => {
  let app: FastifyInstance | undefined;
  let auth: ReturnType<typeof createBetterAuth> | undefined;

  afterEach(async () => {
    if (app) await app.close();
    if (auth) await auth.close();
  });

  const setupApp = async () => {
    const deliveredEmails: AdminInviteDeliveryMessage[] = [];
    const memoryDb = { user: [], session: [], account: [], verification: [] };

    auth = createBetterAuth({
      database: memoryAdapter(memoryDb),
      disableSignUp: true,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    // 1. Create admin user
    await auth.api.createUser({
      body: {
        email: 'walissonead@gmail.com',
        password: 'AdminPassword123!',
        name: 'Walis Admin',
      },
    });

    // 2. Create regular non-admin user
    await auth.api.createUser({
      body: {
        email: 'member@example.com',
        password: 'MemberPassword123!',
        name: 'Regular Member',
      },
    });

    const { state, writes } = createInMemoryStores();
    const store = createInMemoryReadModelStoreFromState(state);
    const tokenStore = createInMemoryDeviceTokenStore();

    app = Fastify({ logger: false });
    registerRoutes(app, {
      store,
      writes,
      tokenStore,
      idempotency: createInMemoryIdempotencyStore(),
      auth,
      adminEmails: ['walissonead@gmail.com'],
      adminInviteDelivery: async (msg) => {
        deliveredEmails.push(msg);
      },
      disableDeviceRegistration: true,
    });

    return { app, auth, deliveredEmails };
  };

  it('unauthenticated request to POST /admin/invite returns 401', async () => {
    const { app } = await setupApp();

    const res = await app.inject({
      method: 'POST',
      url: '/admin/invite',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'guest@example.com' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('non-admin user calling POST /admin/invite returns 403', async () => {
    const { app } = await setupApp();

    // Login as regular member
    const memberLogin = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { email: 'member@example.com', password: 'MemberPassword123!' },
    });
    const cookie = memberLogin.headers['set-cookie'];
    const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : String(cookie);

    const res = await app.inject({
      method: 'POST',
      url: '/admin/invite',
      headers: {
        'content-type': 'application/json',
        cookie: cookieStr,
      },
      payload: { email: 'newmember@example.com' },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('admin.forbidden');
  });

  it('admin creates invite: triggers email delivery with generated password, and guest can sign in', async () => {
    const { app, deliveredEmails } = await setupApp();

    // 1. Login as admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { email: 'walissonead@gmail.com', password: 'AdminPassword123!' },
    });
    const cookie = adminLogin.headers['set-cookie'];
    const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : String(cookie);

    // 2. Admin calls POST /admin/invite
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/admin/invite',
      headers: {
        'content-type': 'application/json',
        cookie: cookieStr,
      },
      payload: { email: 'invited.guest@example.com' },
    });

    expect(inviteRes.statusCode).toBe(201);
    expect(inviteRes.json().success).toBe(true);
    expect(inviteRes.json().email).toBe('invited.guest@example.com');

    // 3. Email delivery received the guest credentials
    expect(deliveredEmails.length).toBe(1);
    const delivered = deliveredEmails[0]!;
    expect(delivered.email).toBe('invited.guest@example.com');
    expect(delivered.password).toBeDefined();
    expect(delivered.password.length).toBeGreaterThanOrEqual(12);
    expect(delivered.invitedBy).toBe('walissonead@gmail.com');

    // 4. Guest uses the delivered credentials to sign in
    const guestLogin = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: {
        email: 'invited.guest@example.com',
        password: delivered.password,
      },
    });

    expect(guestLogin.statusCode).toBe(200);
    const guestCookie = guestLogin.headers['set-cookie'];
    expect(guestCookie).toBeDefined();

    // 5. Guest checks session
    const sessionRes = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie: Array.isArray(guestCookie) ? guestCookie.join('; ') : String(guestCookie) },
    });
    expect(sessionRes.statusCode).toBe(200);
    expect(sessionRes.json().user.email).toBe('invited.guest@example.com');
  });

  it('fails closed when adminInviteDelivery is not configured: returns 503, does not create user, and does not log credentials', async () => {
    const memoryDb = { user: [], session: [], account: [], verification: [] };

    auth = createBetterAuth({
      database: memoryAdapter(memoryDb),
      disableSignUp: true,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    await auth.api.createUser({
      body: {
        email: 'walissonead@gmail.com',
        password: 'AdminPassword123!',
        name: 'Walis Admin',
      },
    });

    const { state, writes } = createInMemoryStores();
    const store = createInMemoryReadModelStoreFromState(state);
    const tokenStore = createInMemoryDeviceTokenStore();

    app = Fastify({ logger: false });
    // Intentionally omit adminInviteDelivery
    registerRoutes(app, {
      store,
      writes,
      tokenStore,
      idempotency: createInMemoryIdempotencyStore(),
      auth,
      adminEmails: ['walissonead@gmail.com'],
      disableDeviceRegistration: true,
    });

    const logSpy = vi.spyOn(console, 'log');
    const createUserSpy = vi.spyOn(auth.api, 'createUser');

    // 1. Login as admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: { email: 'walissonead@gmail.com', password: 'AdminPassword123!' },
    });
    const cookie = adminLogin.headers['set-cookie'];
    const cookieStr = Array.isArray(cookie) ? cookie.join('; ') : String(cookie);

    createUserSpy.mockClear();

    // 2. Admin calls POST /admin/invite without configured delivery
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/admin/invite',
      headers: {
        'content-type': 'application/json',
        cookie: cookieStr,
      },
      payload: { email: 'unconfigured.delivery@example.com' },
    });

    // 3. Must fail closed with 503 and safe error code
    expect(inviteRes.statusCode).toBe(503);
    expect(inviteRes.json().code).toBe('admin.invite_delivery_not_configured');
    expect(inviteRes.json().message).toBe('Serviço de entrega de convite não configurado.');

    // 4. Must NOT create user
    expect(createUserSpy).not.toHaveBeenCalled();

    // 5. Must NOT log credentials to console
    const loggedText = logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(loggedText).not.toContain('INVITE EMAIL');
    expect(loggedText).not.toContain('Temporary Password');
    expect(loggedText).not.toContain('unconfigured.delivery@example.com');

    logSpy.mockRestore();
  });
});
