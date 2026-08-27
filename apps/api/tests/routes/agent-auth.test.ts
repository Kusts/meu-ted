import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryReadModelStoreFromState } from '../../src/read-models/store.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryIdempotencyStore } from '../../src/writes/idempotency.js';
import { createInMemoryAgentReplayStore, type AgentReplayStore } from '../../src/auth/agent-connection-token-replay.js';
import { verifyAgentConnectionToken } from '../../src/auth/agent-connection-token.js';

describe('Agent Auth Routes (Task 3)', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let replayStore: AgentReplayStore;

  const USER_EMAIL = 'member@example.com';
  const HOUSEHOLD_A = 'household-uuid-a';
  const HOUSEHOLD_B = 'household-uuid-b';
  const CONNECTION_SECRET = 'test-agent-connection-secret-at-least-32-chars!';
  const SERVICE_TOKEN = 'test-agent-service-token-at-least-32-chars!';

  let memberCookie = '';
  let userId = '';

  beforeEach(async () => {
    const memoryDb = { user: [], session: [], account: [], verification: [] };
    auth = createBetterAuth({
      database: memoryAdapter(memoryDb),
      disableSignUp: true,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });

    const user = await auth.api.createUser({
      body: {
        email: USER_EMAIL,
        password: 'Password123!',
        name: 'Test Member',
      },
    });
    userId = user?.user?.id ?? 'user-uuid-1';

    const signIn = await auth.api.signInEmail({
      body: {
        email: USER_EMAIL,
        password: 'Password123!',
      },
      asResponse: true,
    });
    memberCookie = signIn.headers.get('set-cookie') ?? '';

    const { state, writes } = createInMemoryStores();
    const store = createInMemoryReadModelStoreFromState(state);
    const tokenStore = createInMemoryDeviceTokenStore();
    replayStore = createInMemoryAgentReplayStore();

    const workspaceAccess = {
      resolve: async (uId: string, hId: string) => {
        if (uId === userId && hId === HOUSEHOLD_A) {
          return {
            userId,
            householdId: HOUSEHOLD_A,
            role: 'owner' as const,
            kind: 'personal' as const,
          };
        }
        return undefined;
      },
    };

    app = Fastify({ logger: false });
    registerRoutes(app, {
      store,
      writes,
      tokenStore,
      idempotency: createInMemoryIdempotencyStore(),
      auth,
      workspaceAccess,
      agentConnectionSecret: CONNECTION_SECRET,
      agentAuthServiceToken: SERVICE_TOKEN,
      agentReplayStore: replayStore,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await auth.close();
  });

  describe('POST /auth/agent-token (Token Emission)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/agent-token',
        headers: { 'x-workspace-id': HOUSEHOLD_A },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'auth.session_required' });
    });

    it('returns 400 when x-workspace-id header is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/agent-token',
        headers: { cookie: memberCookie },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'auth.workspace_required' });
    });

    it('returns 403 when user is not a member of the workspace', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/agent-token',
        headers: {
          cookie: memberCookie,
          'x-workspace-id': HOUSEHOLD_B, // User does not belong to B
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'auth.workspace_forbidden' });
    });

    it('emits short-lived JWT token for verified workspace membership and ignores forged body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/agent-token',
        headers: {
          cookie: memberCookie,
          'x-workspace-id': HOUSEHOLD_A,
        },
        payload: {
          // Forged body attempting privilege escalation
          sub: 'hacker-uuid',
          role: 'admin',
          workspace: 'other-workspace',
        },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data).toMatchObject({
        expiresIn: 120,
        workspace: HOUSEHOLD_A,
        role: 'owner',
      });
      expect(data.token).toBeTypeOf('string');

      // Verify claims directly
      const claims = await verifyAgentConnectionToken(data.token, CONNECTION_SECRET, HOUSEHOLD_A);
      expect(claims.sub).toBe(userId);
      expect(claims.workspace).toBe(HOUSEHOLD_A);
      expect(claims.role).toBe('owner');
    });
  });

  describe('Anti-Replay Consumption (POST /internal/agent/consume-token & POST /auth/agent-token/consume)', () => {
    it('returns 401 when service token is missing or forged', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/internal/agent/consume-token',
        headers: { 'x-agent-service-token': 'wrong-token' },
        payload: {
          jti: 'jti-123',
          workspaceId: HOUSEHOLD_A,
          actorId: userId,
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'auth.invalid_service_token' });
    });

    it('successfully consumes valid token on first attempt', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/internal/agent/consume-token',
        headers: { 'x-agent-service-token': SERVICE_TOKEN },
        payload: {
          jti: 'jti-unique-12345',
          workspaceId: HOUSEHOLD_A,
          actorId: userId,
          connectionId: 'conn-1',
          intentionId: 'intent-1',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ ok: true, consumed: true });
    });

    it('rejects second handshake with the same JTI (anti-replay 409 conflict)', async () => {
      const payload = {
        jti: 'jti-replay-test-67890',
        workspaceId: HOUSEHOLD_A,
        actorId: userId,
      };

      // 1. First consumption succeeds
      const res1 = await app.inject({
        method: 'POST',
        url: '/internal/agent/consume-token',
        headers: { 'x-agent-service-token': SERVICE_TOKEN },
        payload,
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.json().consumed).toBe(true);

      // 2. Second consumption with identical JTI must be rejected with 409
      const res2 = await app.inject({
        method: 'POST',
        url: '/internal/agent/consume-token',
        headers: { 'x-agent-service-token': SERVICE_TOKEN },
        payload,
      });
      expect(res2.statusCode).toBe(409);
      expect(res2.json()).toMatchObject({
        ok: false,
        code: 'agent.token_replayed',
      });
    });

    it('rejects cross-workspace replay of the same token JTI', async () => {
      const jti = 'jti-cross-ws-token';

      // Burn in Workspace A
      const res1 = await app.inject({
        method: 'POST',
        url: '/internal/agent/consume-token',
        headers: { 'x-agent-service-token': SERVICE_TOKEN },
        payload: { jti, workspaceId: HOUSEHOLD_A, actorId: userId },
      });
      expect(res1.statusCode).toBe(200);

      // Attempt reuse in Workspace B
      const res2 = await app.inject({
        method: 'POST',
        url: '/internal/agent/consume-token',
        headers: { 'x-agent-service-token': SERVICE_TOKEN },
        payload: { jti, workspaceId: HOUSEHOLD_B, actorId: userId },
      });
      expect(res2.statusCode).toBe(409);
      expect(res2.json().code).toBe('agent.token_replayed');
    });
  });
});
