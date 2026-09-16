import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryWorkspaceStore } from '../../src/auth/workspaces-http.js';
import { createInMemoryReadModelStore } from '../../src/read-models/store.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { registerCors } from '../../src/server/cors.js';
import type { createBetterAuth } from '../../src/auth/better-auth.js';
import type { WorkspaceAccessStore } from '../../src/auth/workspace-access.js';

/**
 * FIX-AUTH-BOOT FINDING 1 (HIGH — kill-switch incompleto, Fase 2 security review).
 *
 * Com `SESSION_BEARER_FALLBACK_ENABLED=false`, o hook de resolução de auth
 * removia o header `authorization` para todas as rotas EXCETO `/auth/*` e
 * `/api/auth/*` — e o plugin bearer() do Better-Auth continuava aceitando o
 * bearer legado nessas rotas. Quem tinha um bearer antigo chamava
 * POST /auth/devices/register (ou rotate via sessão) e recebia um device
 * token PERMANENTE capaz de autenticar rotas financeiras.
 *
 * Correção esperada: com a flag OFF, o bearer legado é removido ANTES de
 * TODA chamada a Better-Auth, incluindo /auth/* (sem exceção) — register /
 * rotate / session por bearer legado falham fail-closed e nenhum device
 * token é mintado. Preservados: X-Device-Token, cookie, pi-agent.
 *
 * RED primeiro: com a flag OFF o bearer ainda minta device token (201).
 */

const WS = '11111111-1111-4111-8111-111111111111';
const LEGACY_BEARER = 'sess-bearer-legacy-9';
const SESSION_COOKIE = 'better-auth.session_token=sess-cookie-9';

// Mesmo mock semântico de session-bearer-fallback.test.ts: better-auth real
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

type SeenEvent = { eventType: string; workspaceId: string };

const buildApp = (seen: SeenEvent[], calls: { register: number; rotate: number }) => {
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
        if (token === 'dev-9') return { deviceId: 'd9', householdId: WS };
        throw Object.assign(new Error('invalid'), { statusCode: 401, code: 'auth.invalid_token' });
      },
      async register(deviceName, householdId, opts?: { userId?: string }) {
        calls.register += 1;
        return { token: 'dev-9', deviceId: 'd9', householdId, ...(opts?.userId ? { userId: opts.userId } : {}) };
      },
      async rotate(_predecessor, deviceName, householdId, opts?: { userId?: string }) {
        calls.rotate += 1;
        return { token: 'dev-9-rot', deviceId: 'd9', householdId, ...(opts?.userId ? { userId: opts.userId } : {}) };
      },
      async revoke() {},
    },
    // Produção: registro de device exige sessão autenticada.
    disableDeviceRegistration: true,
    auth: buildAuthMock(),
    workspaceAccess,
    workspaceStore: createInMemoryWorkspaceStore(),
    legacyBearerAuditLog: (event: { eventType: string; workspaceId: string }) => {
      seen.push({ eventType: event.eventType, workspaceId: event.workspaceId });
    },
  });
  app.get('/_ks-probe', async (request) => request.authenticatedContext ?? { anonymous: true });
  return app;
};

afterEach(() => {
  delete process.env.SESSION_BEARER_FALLBACK_ENABLED;
});

describe('FIX-AUTH-BOOT FINDING 1 — kill-switch cobre /auth/* (API)', () => {
  it('flag OFF: bearer legado em POST /auth/devices/register NÃO minta device token (fail-closed)', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
    const seen: SeenEvent[] = [];
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(seen, calls);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { authorization: `Bearer ${LEGACY_BEARER}`, 'x-workspace-id': WS },
      payload: { deviceName: 'attacker device' },
    });
    // Fail-closed: register anônimo com registro desabilitado responde 403
    // (auth.ts, fora do escopo deste fix) — o invariante de segurança é
    // NENHUM device token mintado a partir do bearer legado.
    expect(res.statusCode).toBe(403);
    expect(calls.register).toBe(0);
    await app.close();
  });

  it('flag OFF: bearer legado em POST /auth/devices/rotate (via sessão) → 401, sem rotação', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
    const seen: SeenEvent[] = [];
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(seen, calls);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/rotate',
      headers: { authorization: `Bearer ${LEGACY_BEARER}` },
      payload: { deviceName: 'attacker device' },
    });
    expect(res.statusCode).toBe(401);
    expect(calls.rotate).toBe(0);
    await app.close();
  });

  it('flag OFF: bearer negado NÃO emite legacy_bearer_used (só uso efetivo conta)', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
    const seen: SeenEvent[] = [];
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(seen, calls);
    await app.ready();
    const res = await app.inject({
      method: 'GET',
      url: '/_ks-probe',
      headers: { 'x-workspace-id': WS, authorization: `Bearer ${LEGACY_BEARER}` },
    });
    expect(res.statusCode).toBe(401);
    expect(seen).toHaveLength(0);
    await app.close();
  });

  it('flag OFF: cookie continua autenticando register (cookie intacto)', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
    const seen: SeenEvent[] = [];
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(seen, calls);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { cookie: SESSION_COOKIE, 'x-workspace-id': WS },
      payload: { deviceName: 'my device' },
    });
    expect(res.statusCode).toBe(201);
    expect(calls.register).toBe(1);
    expect(res.json()).toMatchObject({ token: 'dev-9' });
    await app.close();
  });

  it('flag OFF: rotate por X-Device-Token continua funcionando (device path intacto)', async () => {
    process.env.SESSION_BEARER_FALLBACK_ENABLED = 'false';
    const seen: SeenEvent[] = [];
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(seen, calls);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/rotate',
      headers: { 'x-device-token': 'dev-9', authorization: `Bearer ${LEGACY_BEARER}` },
      payload: { deviceName: 'rotated' },
    });
    expect(res.statusCode).toBe(201);
    expect(calls.rotate).toBe(1);
    await app.close();
  });

  it('flag ON: comportamento atual preservado — bearer autentica register (201)', async () => {
    const seen: SeenEvent[] = [];
    const calls = { register: 0, rotate: 0 };
    const app = buildApp(seen, calls);
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/devices/register',
      headers: { authorization: `Bearer ${LEGACY_BEARER}`, 'x-workspace-id': WS },
      payload: { deviceName: 'my device' },
    });
    expect(res.statusCode).toBe(201);
    expect(calls.register).toBe(1);
    await app.close();
  });
});
