import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryWorkspaceStore } from '../../src/auth/workspaces-http.js';
import { createInMemoryReadModelStore } from '../../src/read-models/store.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { registerCors } from '../../src/server/cors.js';
import type { createBetterAuth } from '../../src/auth/better-auth.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';

/**
 * T2.3 — B3 passo 7: remoção do fallback bearer SERVER-SIDE
 * (SPEC §8 B3/B5, ADR-015).
 *
 * Gate: env `SESSION_BEARER_FALLBACK_ENABLED` (default TRUE durante a
 * janela). false => bearer de sessão rejeitado como autenticador (401, ou
 * fallback a device token quando aplicável). true => comportamento atual.
 *
 * RED primeiro: com env=false o bearer ainda autentica (gate inexistente).
 */

const WS = '11111111-1111-4111-8111-111111111111';
const LEGACY_BEARER = 'sess-bearer-legacy-7';
const SESSION_COOKIE = 'better-auth.session_token=sess-cookie-7';

// Mesmo mock semântico de legacy-bearer-telemetry.test.ts: better-auth real
// (plugin bearer) resolve por cookie OU por Authorization Bearer.
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

const buildApp = () => {
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
    tokenStore: createInMemoryDeviceTokenStore(),
    disableDeviceRegistration: true,
    auth: buildAuthMock(),
    workspaceAccess,
    workspaceStore: createInMemoryWorkspaceStore(),
  });
  app.get('/_t23-probe', async (request) => request.authenticatedContext ?? { anonymous: true });
  return app;
};

afterEach(() => {
  delete process.env.SESSION_BEARER_FALLBACK_ENABLED;
});

describe('T2.3 B3.7 session bearer fallback gate (API)', () => {
  it('env=true (default): bearer de sessão autentica (comportamento atual)', async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t23-probe',
      headers: { 'x-workspace-id': WS, authorization: `Bearer ${LEGACY_BEARER}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ householdId: WS, actorType: 'user' });
    await app.close();
  });

  it('env=false: bearer de sessão NÃO autentica (401)', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t23-probe',
      headers: { 'x-workspace-id': WS, authorization: `Bearer ${LEGACY_BEARER}` },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('env=false: cookie continua autenticando (session-first preservado)', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t23-probe',
      headers: { 'x-workspace-id': WS, cookie: SESSION_COOKIE },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ householdId: WS, actorType: 'user' });
    await app.close();
  });

  it('env=false: bearer + device token válido => fallback a device token', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
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
          if (token === 'dev-7') return { deviceId: 'd7', householdId: WS, userId: 'user-1' };
          throw Object.assign(new Error('invalid'), { statusCode: 401, code: 'auth.invalid_token' });
        },
        async register(deviceName, householdId) {
          return { token: 'dev-7', deviceId: 'd7', householdId };
        },
        async revoke() {},
      },
      disableDeviceRegistration: true,
      auth: buildAuthMock(),
      workspaceAccess,
      workspaceStore: createInMemoryWorkspaceStore(),
    });
    app.get('/_t23-probe', async (request) => request.authenticatedContext ?? { anonymous: true });
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_t23-probe',
      headers: {
        'x-workspace-id': WS,
        authorization: `Bearer ${LEGACY_BEARER}`,
        'x-device-token': 'dev-7',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ householdId: WS, actorType: 'device' });
    await app.close();
  });
});
