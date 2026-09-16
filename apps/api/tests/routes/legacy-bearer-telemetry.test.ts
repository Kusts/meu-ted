import Fastify from 'fastify';
import { describe, expect, it, beforeEach } from 'vitest';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryWorkspaceStore } from '../../src/auth/workspaces-http.js';
import { createInMemoryReadModelStore } from '../../src/read-models/store.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { registerCors } from '../../src/server/cors.js';
import type { createBetterAuth } from '../../src/auth/better-auth.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';

/**
 * T2.2 / T0.4.1 — `auth.request.legacy_bearer_used` (SPEC §24.1):
 * emitido SOMENTE quando o cookie/session NÃO autenticou a request E o
 * bearer legado foi o autenticador efetivo do fallback. Login, header
 * presente sem autenticar, sessão via cookie e fallback de device token
 * NÃO contam.
 */

const WS = '11111111-1111-4111-8111-111111111111';
const LEGACY_BEARER = 'sess-bearer-legacy-1';
const SESSION_COOKIE = 'better-auth.session_token=sess-cookie-1';

// Better-Auth real (com plugin bearer) resolve a sessão por cookie OU por
// `Authorization: Bearer <session-token>`. O mock reproduz exatamente essa
// semântica para provar o "autenticador efetivo": a sonda sem-Authorization
// abaixo distingue cookie (resolve) de bearer-only (não resolve).
const buildAuthMock = () =>
  ({
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const authorization = headers.get('authorization');
        const cookie = headers.get('cookie') ?? '';
        if (authorization === `Bearer ${LEGACY_BEARER}`) {
          return { user: { id: 'user-1', email: 'u@example.test' }, session: { id: 's-bearer' } };
        }
        if (cookie.includes(SESSION_COOKIE)) {
          return { user: { id: 'user-1', email: 'u@example.test' }, session: { id: 's-cookie' } };
        }
        return null;
      },
    },
    options: { baseURL: 'http://localhost:3001', trustedOrigins: [] },
  }) as unknown as ReturnType<typeof createBetterAuth>;

const workspaceAccess: WorkspaceAccessStore = {
  async resolve(authUserId, householdId) {
    if (authUserId === 'user-1' && householdId === WS) {
      return { userId: 'user-1', householdId, role: 'owner', kind: 'shared' };
    }
    return undefined;
  },
};

type SeenEvent = { eventType: string; workspaceId: string };

const buildApp = (seen: SeenEvent[], withSink = true) => {
  const { writes } = createInMemoryStores({});
  const store = createInMemoryReadModelStore({
    accounts: [],
    categories: [],
    transactions: [],
    deletedTransactionIds: [],
  });
  const tokenStore = createInMemoryDeviceTokenStore();
  const app = Fastify({ logger: false });
  registerCors(app);
  registerRoutes(app, {
    store,
    writes,
    tokenStore,
    disableDeviceRegistration: true,
    auth: buildAuthMock(),
    workspaceAccess,
    workspaceStore: createInMemoryWorkspaceStore(),
    ...(withSink
      ? {
          legacyBearerAuditLog: (event: { eventType: string; workspaceId: string }) => {
            seen.push({ eventType: event.eventType, workspaceId: event.workspaceId });
          },
        }
      : {}),
  });
  app.get('/_t22-probe', async (request) => request.authenticatedContext ?? { anonymous: true });
  return app;
};

describe('T0.4.1 auth.request.legacy_bearer_used (V4 T2.2)', () => {
  let seen: SeenEvent[];
  beforeEach(() => {
    seen = [];
  });

  it('does NOT emit for a cookie-authenticated request (session, no bearer)', async () => {
    const app = buildApp(seen);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t22-probe',
      headers: { 'x-workspace-id': WS, cookie: SESSION_COOKIE },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ householdId: WS, actorType: 'user' });
    expect(seen).toHaveLength(0);
    await app.close();
  });

  it('emits exactly 1 event when the legacy bearer is the effective authenticator', async () => {
    const app = buildApp(seen);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t22-probe',
      headers: { 'x-workspace-id': WS, authorization: `Bearer ${LEGACY_BEARER}` },
    });
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({
      eventType: 'auth.request.legacy_bearer_used',
      workspaceId: WS,
    });
    await app.close();
  });

  it('does NOT emit when the cookie alone would authenticate (bearer present but redundant)', async () => {
    const app = buildApp(seen);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t22-probe',
      headers: {
        'x-workspace-id': WS,
        cookie: SESSION_COOKIE,
        authorization: `Bearer ${LEGACY_BEARER}`,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(0);
    await app.close();
  });

  it('does NOT emit for login (header presente / tentativa não contam)', async () => {
    const app = buildApp(seen);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/sign-in/email',
      headers: { authorization: `Bearer ${LEGACY_BEARER}` },
      payload: { email: 'u@example.test', password: 'x'.repeat(12) },
    });
    expect([400, 401, 404, 422, 500]).toContain(res.statusCode);
    expect(seen).toHaveLength(0);
    await app.close();
  });

  it('does NOT emit for device-token fallback (telemetria própria em T2.4)', async () => {
    const { writes } = createInMemoryStores({});
    const store = createInMemoryReadModelStore({
      accounts: [],
      categories: [],
      transactions: [],
      deletedTransactionIds: [],
    });
    const app = Fastify({ logger: false });
    registerCors(app);
    registerRoutes(app, {
      store,
      writes,
      tokenStore: {
        async resolve(token) {
          if (token === 'dev-1') return { deviceId: 'd1', householdId: WS };
          throw Object.assign(new Error('invalid'), { statusCode: 401, code: 'auth.invalid_token' });
        },
        async register(deviceName, householdId) {
          return { token: 'dev-1', deviceId: 'd1', householdId };
        },
        async revoke() {},
      },
      disableDeviceRegistration: true,
      auth: buildAuthMock(),
      workspaceAccess,
      workspaceStore: createInMemoryWorkspaceStore(),
      legacyBearerAuditLog: (event: { eventType: string; workspaceId: string }) => {
        seen.push({ eventType: event.eventType, workspaceId: event.workspaceId });
      },
    });
    app.get('/_t22-probe', async (request) => request.authenticatedContext ?? { anonymous: true });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t22-probe',
      headers: { 'x-workspace-id': WS, 'x-device-token': 'dev-1' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ householdId: WS, actorType: 'device' });
    expect(seen).toHaveLength(0);
    await app.close();
  });

  it('never breaks auth when no sink is injected (telemetry best-effort)', async () => {
    const app = buildApp(seen, false);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t22-probe',
      headers: { 'x-workspace-id': WS, authorization: `Bearer ${LEGACY_BEARER}` },
    });
    expect(res.statusCode).toBe(200);
    expect(seen).toHaveLength(0);
    await app.close();
  });
});
