import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryReadModelStoreFromState } from '../../src/read-models/store.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryIdempotencyStore } from '../../src/writes/idempotency.js';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';
import type { LlmConfigStore } from '../../src/agent/llm-config-store.js';

describe('Admin & Internal Agent LLM Configuration Routes (Task 2)', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let llmStore: LlmConfigStore;

  const ADMIN_EMAIL = 'walissonead@gmail.com';
  const MEMBER_EMAIL = 'member@example.com';
  const CONFIG_TOKEN = 'test-secret-config-token-32-chars-minimum!';

  let adminCookie = '';
  let memberCookie = '';

  beforeEach(async () => {
    const memoryDb = { user: [], session: [], account: [], verification: [] };
    auth = createBetterAuth({
      database: memoryAdapter(memoryDb),
      disableSignUp: true,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000', 'https://pi-finance-pwa.walissonead.workers.dev'],
    });

    // 1. Create admin user & session
    await auth.api.createUser({
      body: {
        email: ADMIN_EMAIL,
        password: 'AdminPassword123!',
        name: 'Walis Admin',
      },
    });
    const adminSignIn = await auth.api.signInEmail({
      body: {
        email: ADMIN_EMAIL,
        password: 'AdminPassword123!',
      },
      asResponse: true,
    });
    adminCookie = adminSignIn.headers.get('set-cookie') ?? '';

    // 2. Create regular user & session
    await auth.api.createUser({
      body: {
        email: MEMBER_EMAIL,
        password: 'MemberPassword123!',
        name: 'Regular Member',
      },
    });
    const memberSignIn = await auth.api.signInEmail({
      body: {
        email: MEMBER_EMAIL,
        password: 'MemberPassword123!',
      },
      asResponse: true,
    });
    memberCookie = memberSignIn.headers.get('set-cookie') ?? '';

    const { state, writes } = createInMemoryStores();
    const store = createInMemoryReadModelStoreFromState(state);
    const tokenStore = createInMemoryDeviceTokenStore();
    llmStore = createInMemoryLlmConfigStore();

    app = Fastify({ logger: false });
    registerRoutes(app, {
      store,
      writes,
      tokenStore,
      idempotency: createInMemoryIdempotencyStore(),
      auth,
      adminEmails: [ADMIN_EMAIL],
      llmConfigStore: llmStore,
      agentConfigToken: CONFIG_TOKEN,
      trustedOrigins: ['http://localhost:3000', 'https://pi-finance-pwa.walissonead.workers.dev'],
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await auth.close();
  });

  describe('Authentication & Authorization Guards', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/agent/llm-config',
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'auth.session_required' });
    });

    it('returns 403 when authenticated as a standard non-admin member', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/agent/llm-config',
        headers: {
          cookie: memberCookie,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'auth.admin_forbidden' });
    });

    it('allows access to global admin with case-insensitive email matching', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/agent/llm-config',
        headers: {
          cookie: adminCookie,
        },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.providers.length).toBeGreaterThanOrEqual(4);
      expect(data.runtime.singleton).toBe('active');
    });

    it('rejects attempt to spoof admin via x-user-email or x-user-role headers without session', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: '/admin/agent/llm-config',
        headers: {
          'x-user-email': ADMIN_EMAIL,
          'x-user-role': 'admin',
        },
      });
      expect(getRes.statusCode).toBe(401);
      expect(getRes.json()).toMatchObject({ code: 'auth.session_required' });

      const postRes = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/security-epoch',
        headers: {
          'x-user-email': ADMIN_EMAIL,
          'x-user-role': 'admin',
          origin: 'http://localhost:3000',
        },
        payload: {
          reason: 'spoofing-attempt',
        },
      });
      expect(postRes.statusCode).toBe(401);
      expect(postRes.json()).toMatchObject({ code: 'auth.session_required' });
    });
  });

  describe('CSRF & SSRF Protections', () => {
    it('returns 403 on mutation with untrusted origin', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: {
          cookie: adminCookie,
          origin: 'https://malicious-site.attacker.com',
        },
        payload: {
          providerId: 'opencode-zen',
          modelId: 'zen-default',
          expectedVersion: 1,
        },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'auth.csrf_rejected' });
    });

    it('Fase 3 D4: Bearer callers skip the Origin check (no cookie-CSRF surface)', async () => {
      // An explicit Authorization header cannot be smuggled by a simple
      // cross-site request, so the cookie-CSRF check must not fire: the call
      // proceeds to session auth (401 here — no session — instead of 403).
      const res = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: {
          authorization: 'Bearer service-token-value',
          origin: 'https://malicious-site.attacker.com',
        },
        payload: {
          providerId: 'opencode-zen',
          modelId: 'zen-default',
          expectedVersion: 1,
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'auth.session_required' });
    });

    it('Fase 3-FIX D4-rev: the four CSRF branches (Bearer/cookie × origin present/absent)', async () => {
      const payload = {
        providerId: 'opencode-zen',
        modelId: 'zen-default',
        expectedVersion: 1,
      };
      // 1. Bearer + no Origin/Referer → skips CSRF (401: no session here).
      const bearerNoOrigin = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: { authorization: 'Bearer service-token-value' },
        payload,
      });
      expect(bearerNoOrigin.statusCode).toBe(401);
      expect(bearerNoOrigin.json()).toMatchObject({ code: 'auth.session_required' });
      // 2. Cookie-session + no Origin/Referer → fail-closed 403.
      const cookieNoOrigin = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: { cookie: adminCookie },
        payload,
      });
      expect(cookieNoOrigin.statusCode).toBe(403);
      expect(cookieNoOrigin.json()).toMatchObject({ code: 'auth.csrf_rejected' });
      // 3. Cookie-session + hostile Origin → 403 (pinned by the earlier test).
      const cookieHostile = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: { cookie: adminCookie, origin: 'https://malicious-site.attacker.com' },
        payload,
      });
      expect(cookieHostile.statusCode).toBe(403);
      expect(cookieHostile.json()).toMatchObject({ code: 'auth.csrf_rejected' });
      // 4. Bearer + hostile Origin → not a CSRF block (401: no session here).
      const bearerHostile = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: {
          authorization: 'Bearer service-token-value',
          origin: 'https://malicious-site.attacker.com',
        },
        payload,
      });
      expect(bearerHostile.statusCode).toBe(401);
      expect(bearerHostile.json()).toMatchObject({ code: 'auth.session_required' });
    });

    it('rejects attempt to inject custom baseUrl or raw apiKey (SSRF defense)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/models',
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:3000',
        },
        payload: {
          providerId: 'openai-api',
          modelId: 'gpt-4o',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
          baseUrl: 'http://169.254.169.254/latest/meta-data',
          apiKey: 'sk-raw-secret-stolen-key',
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ code: 'agent.invalid_parameters' });
    });
  });

  describe('Admin Operations Workflow', () => {
    it('syncs catalogue items and registers models as disabled', async () => {
      const syncRes = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/sync-catalog',
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:3000',
        },
        payload: {
          items: [
            {
              providerId: 'openai-api',
              modelId: 'gpt-4o',
              protocol: 'chat-completions',
              privacyClass: 'training_prohibited',
            },
          ],
        },
      });
      expect(syncRes.statusCode).toBe(200);
      expect(syncRes.json()).toMatchObject({ ok: true, synced: 1 });

      const listRes = await app.inject({
        method: 'GET',
        url: '/admin/agent/llm-config',
        headers: { cookie: adminCookie },
      });
      const data = listRes.json();
      expect(data.models).toHaveLength(1);
      expect(data.models[0].enabled).toBe(false);
    });

    it('toggles provider and model enabled status', async () => {
      // 1. Register model
      await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/models',
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:3000',
        },
        payload: {
          providerId: 'opencode-zen',
          modelId: 'zen-standard',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
          enabled: false,
        },
      });

      // 2. Toggle provider enabled
      const pToggle = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/providers/opencode-zen/toggle',
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:3000',
        },
        payload: { enabled: true },
      });
      expect(pToggle.statusCode).toBe(200);
      expect(pToggle.json().provider.enabled).toBe(true);

      // 3. Toggle model enabled
      const mToggle = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/models/opencode-zen:zen-standard/toggle',
        headers: {
          cookie: adminCookie,
          origin: 'http://localhost:3000',
        },
        payload: { enabled: true },
      });
      expect(mToggle.statusCode).toBe(200);
      expect(mToggle.json().model.enabled).toBe(true);
    });

    it('enforces activation safety invariants (Step 6)', async () => {
      // 1. Try activating disabled provider -> blocked 422
      await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/models',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: {
          providerId: 'openai-api',
          modelId: 'gpt-4o',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
          enabled: true,
        },
      });

      const act1 = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: {
          providerId: 'openai-api',
          modelId: 'openai-api:gpt-4o',
          expectedVersion: 1,
        },
      });
      expect(act1.statusCode).toBe(422);
      expect(act1.json()).toMatchObject({ code: 'agent.activation_blocked', reason: 'provider is disabled' });

      // 2. Try activating experimental_blocked provider (Codex subscription) -> blocked 422.
      // Fase 3-FIX R1: incompatible pairs are rejected at creation, so the
      // activation-blocking fixtures below are seeded directly (legacy rows).
      await llmStore.upsertModel({
        providerId: 'openai-codex-subscription',
        modelId: 'codex-preview',
        protocol: 'responses',
        privacyClass: 'training_prohibited',
        enabled: true,
      });
      await llmStore.setModelEnabled('openai-codex-subscription:codex-preview', true);
      await llmStore.setProviderEnabled('openai-codex-subscription', true);

      const actCodex = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: {
          providerId: 'openai-codex-subscription',
          modelId: 'openai-codex-subscription:codex-preview',
          expectedVersion: 1,
        },
      });
      expect(actCodex.statusCode).toBe(422);
      expect(actCodex.json().reason).toBe('provider is not approved for activation');

      // 3. Try activating model with training_allowed -> blocked 422
      // (seeded directly: opencode-go + messages is rejected at creation).
      await llmStore.upsertModel({
        providerId: 'opencode-go',
        modelId: 'go-training',
        protocol: 'messages',
        privacyClass: 'training_allowed',
        enabled: true,
      });
      await llmStore.setModelEnabled('opencode-go:go-training', true);
      await llmStore.setProviderEnabled('opencode-go', true);

      const actTraining = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: {
          providerId: 'opencode-go',
          modelId: 'opencode-go:go-training',
          expectedVersion: 1,
        },
      });
      expect(actTraining.statusCode).toBe(422);
      expect(actTraining.json().reason).toBe('model with training_allowed is blocked');

      // 4. Successful activation of approved, enabled, training_prohibited pair
      await llmStore.setProviderEnabled('openai-api', true);
      const actOk = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/activate',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: {
          providerId: 'openai-api',
          modelId: 'openai-api:gpt-4o',
          rolloutMode: 'all',
          expectedVersion: 1,
        },
      });
      expect(actOk.statusCode).toBe(200);
      expect(actOk.json().runtime).toMatchObject({
        activeProviderId: 'openai-api',
        activeModelId: 'openai-api:gpt-4o',
        activeProtocol: 'chat-completions',
        activeRolloutMode: 'all',
        activeRolloutPercentage: 100,
        version: 2,
      });
    });

    it('manages rollout and security epoch emergency bump', async () => {
      // 1. Rollout mode update
      const rolloutRes = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/rollout',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: {
          rolloutMode: 'canary',
          canaryAllowlist: ['ws-canary-1', 'ws-canary-2'],
          expectedVersion: 1,
        },
      });
      expect(rolloutRes.statusCode).toBe(200);
      expect(rolloutRes.json().runtime).toMatchObject({
        activeRolloutMode: 'canary',
        canaryAllowlist: ['ws-canary-1', 'ws-canary-2'],
        version: 2,
      });

      // 2. Concurrency conflict on stale version
      const conflictRes = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/rollout',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: {
          rolloutMode: 'all',
          expectedVersion: 1,
        },
      });
      expect(conflictRes.statusCode).toBe(409);
      expect(conflictRes.json()).toMatchObject({ code: 'agent.version_conflict' });

      // 3. Security Epoch bump
      const epochRes = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/security-epoch',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      });
      expect(epochRes.statusCode).toBe(200);
      expect(epochRes.json().runtime).toMatchObject({
        securityEpoch: 2,
        version: 3,
      });
    });

    it('returns sanitized test-connection payload without exposing secrets', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/admin/agent/llm-config/test-connection',
        headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
        payload: { providerId: 'openai-api' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        ready: false,
        code: 'not_configured',
      });
    });
  });

  describe('Internal LLM Config Route (GET /internal/agent/llm-config)', () => {
    it('rejects unauthenticated internal call without token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/internal/agent/llm-config',
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'auth.invalid_token' });
    });

    it('rejects invalid or forged token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/internal/agent/llm-config',
        headers: {
          'x-agent-config-token': 'wrong-token-value',
        },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ code: 'auth.invalid_token' });
    });

    it('returns sanitized active configuration when valid token is provided', async () => {
      // Setup active pair
      await llmStore.setProviderEnabled('openai-api', true);
      const model = await llmStore.upsertModel({
        providerId: 'openai-api',
        modelId: 'gpt-4o',
        protocol: 'chat-completions',
        privacyClass: 'training_prohibited',
        enabled: true,
      });
      await llmStore.updateRuntime({
        providerId: 'openai-api',
        modelId: model.id,
        rolloutMode: 'all',
        expectedVersion: 1,
        updatedBy: ADMIN_EMAIL,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/internal/agent/llm-config',
        headers: {
          'x-agent-config-token': CONFIG_TOKEN,
        },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.activeProvider).toEqual({
        id: 'openai-api',
        kind: 'openai-api',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'OPENAI_API_KEY',
        serviceAlias: null,
        eligibility: 'approved',
      });
      expect(data.activeModel).toEqual({
        id: 'openai-api:gpt-4o',
        modelId: 'gpt-4o',
        protocol: 'chat-completions',
        privacyClass: 'training_prohibited',
      });
      expect(data.fallbackProvider).toBeNull();
      expect(data.fallbackModel).toBeNull();
      expect(data.activeDisabled).toBe(false);
      expect(data.fallbackDisabled).toBe(false);
      expect(data.runtime).toMatchObject({
        singleton: 'active',
        activeProviderId: 'openai-api',
        activeModelId: 'openai-api:gpt-4o',
        activeProtocol: 'chat-completions',
        activeRolloutMode: 'all',
        activeRolloutPercentage: 100,
        fallbackProviderId: null,
        fallbackModelId: null,
        canaryAllowlist: [],
        securityEpoch: 1,
        version: 2,
      });
    });

    it('returns configured fallback provider and model when set', async () => {
      await llmStore.upsertProvider({
        id: 'opencode-zen',
        kind: 'opencode-zen',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'OPENCODE_ZEN_API_KEY',
        eligibility: 'approved',
      });
      // upsert preserves `enabled` on conflict; enable via the guarded path.
      await llmStore.setProviderEnabled('opencode-zen', true);
      const fallbackModel = await llmStore.upsertModel({
        providerId: 'opencode-zen',
        modelId: 'zen-fallback',
        protocol: 'chat-completions',
        privacyClass: 'training_prohibited',
        enabled: true,
      });

      const currentRuntime = await llmStore.getRuntime();
      await llmStore.updateRuntime({
        providerId: currentRuntime.providerId,
        modelId: currentRuntime.modelId,
        fallbackProviderId: 'opencode-zen',
        fallbackModelId: fallbackModel.id,
        expectedVersion: currentRuntime.version,
        updatedBy: ADMIN_EMAIL,
      });

      const res = await app.inject({
        method: 'GET',
        url: '/internal/agent/llm-config',
        headers: {
          'x-agent-config-token': CONFIG_TOKEN,
        },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.fallbackProvider).toMatchObject({
        id: 'opencode-zen',
        kind: 'opencode-zen',
      });
      expect(data.fallbackModel).toMatchObject({
        id: 'opencode-zen:zen-fallback',
        modelId: 'zen-fallback',
      });
      expect(data.fallbackDisabled).toBe(false);
      expect(data.runtime.fallbackProviderId).toBe('opencode-zen');
      expect(data.runtime.fallbackModelId).toBe(fallbackModel.id);
    });
  });
});
