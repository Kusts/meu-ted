import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryReadModelStoreFromState } from '../../src/read-models/store.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryIdempotencyStore } from '../../src/writes/idempotency.js';

describe('Better-Auth server boot & endpoints contract', () => {
  let app: FastifyInstance | undefined;
  let auth: ReturnType<typeof createBetterAuth> | undefined;

  afterEach(async () => {
    if (app) await app.close();
    if (auth) await auth.close();
  });

  const setupServer = async (opts: { disableSignUp?: boolean } = {}) => {
    const memoryDb = { user: [], session: [], account: [], verification: [] };
    auth = createBetterAuth({
      database: memoryAdapter(memoryDb),
      disableSignUp: opts.disableSignUp ?? true,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['https://pwa.example', 'http://localhost:3000'],
    });

    // Seed a known test user directly via admin createUser
    await auth.api.createUser({
      body: {
        email: 'user@example.com',
        password: 'correctPassword123!',
        name: 'Test User',
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
      disableDeviceRegistration: true,
    });

    return { app, auth };
  };

  it('sign-in with correct credentials creates session cookie', async () => {
    const { app } = await setupServer();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: {
        email: 'user@example.com',
        password: 'correctPassword123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    expect(cookieStr).toMatch(/better-auth\.session_token=/);
  });

  it('sign-in with incorrect password returns 401 or invalid credentials', async () => {
    const { app } = await setupServer();

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: {
        email: 'user@example.com',
        password: 'wrongPassword!',
      },
    });

    expect([400, 401]).toContain(res.statusCode);
  });

  it('GET /auth/session returns user data when authenticated, 401 when unauthenticated', async () => {
    const { app } = await setupServer();

    // 1. Unauthenticated request to /auth/session returns 401
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/auth/session',
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Sign-in
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: {
        email: 'user@example.com',
        password: 'correctPassword123!',
      },
    });
    const setCookie = loginRes.headers['set-cookie'];
    const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);

    // 3. Authenticated request to /auth/session returns 200 with user
    const authRes = await app.inject({
      method: 'GET',
      url: '/auth/session',
      headers: { cookie: cookieStr },
    });
    expect(authRes.statusCode).toBe(200);
    const body = authRes.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('user@example.com');
  });

  it('POST /auth/sign-up/email is forbidden/rejected when disableSignUp is true', async () => {
    const { app } = await setupServer({ disableSignUp: true });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-up/email',
      headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' },
      payload: {
        email: 'stranger@example.com',
        password: 'password123!',
        name: 'Stranger',
      },
    });

    // better-auth returns 403 or error when signup is disabled
    expect([400, 403]).toContain(res.statusCode);
  });
});
