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

describe('Phase0 route invariants — RED→GREEN', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let llmStore: LlmConfigStore;
  const ADMIN_EMAIL = 'phase0-admin@test.com';
  const CONFIG_TOKEN = 'test-secret-config-token-32-chars-minimum!';
  let adminCookie = '';

  const buildApp = async (llmSeed?: Parameters<typeof createInMemoryLlmConfigStore>[0]) => {
    const memoryDb: any = { user: [], session: [], account: [], verification: [] };
    auth = createBetterAuth({
      database: memoryAdapter(memoryDb),
      disableSignUp: true,
      transaction: false,
      secret: 'test-secret-that-is-at-least-32-characters',
      baseURL: 'http://localhost:3001',
      trustedOrigins: ['http://localhost:3000'],
    });
    await auth.api.createUser({
      body: { email: ADMIN_EMAIL, password: 'AdminPassword123!', name: 'Admin' },
    });
    const signIn = await auth.api.signInEmail({
      body: { email: ADMIN_EMAIL, password: 'AdminPassword123!' },
      asResponse: true,
    });
    adminCookie = signIn.headers.get('set-cookie') ?? '';
    const { state, writes } = createInMemoryStores();
    const store = createInMemoryReadModelStoreFromState(state);
    llmStore = createInMemoryLlmConfigStore(llmSeed);
    app = Fastify({ logger: false });
    registerRoutes(app, {
      store,
      writes,
      tokenStore: createInMemoryDeviceTokenStore(),
      idempotency: createInMemoryIdempotencyStore(),
      auth,
      adminEmails: [ADMIN_EMAIL],
      llmConfigStore: llmStore,
      agentConfigToken: CONFIG_TOKEN,
      trustedOrigins: ['http://localhost:3000'],
    });
    await app.ready();
  };

  beforeEach(async () => {
    await buildApp();
  });

  afterEach(async () => {
    await app.close();
    await auth.close();
  });

  it('activate rejects cross provider/model pair with 422 model does not belong to provider', async () => {
    // Setup two providers and models
    await llmStore.setProviderEnabled('openai-api', true);
    await llmStore.setProviderEnabled('opencode-zen', true);
    const modelZen = await llmStore.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const runtime = await llmStore.getRuntime();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/activate',
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      payload: {
        providerId: 'openai-api', // intentional mismatch
        modelId: modelZen.id, // belongs to opencode-zen
        expectedVersion: runtime.version,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'agent.activation_blocked', reason: 'model does not belong to provider' });
    // ensure runtime unchanged
    const after = await llmStore.getRuntime();
    expect(after.providerId).toBeNull();
  });

  it('fallback rejects cross provider/model pair', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    await llmStore.setProviderEnabled('opencode-zen', true);
    const modelA = await llmStore.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await llmStore.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    let rt = await llmStore.getRuntime();
    rt = await llmStore.updateRuntime({ providerId: 'openai-api', modelId: modelA.id, expectedVersion: rt.version, updatedBy: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/fallback',
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      payload: {
        providerId: 'openai-api',
        modelId: 'opencode-zen:zen-1',
        expectedVersion: rt.version,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'agent.activation_blocked', reason: 'model does not belong to provider' });
  });

  it('toggle provider active → 409 via route', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    const m = await llmStore.upsertModel({ providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true });
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({ providerId: 'openai-api', modelId: m.id, expectedVersion: rt.version, updatedBy: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/openai-api/toggle',
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'agent.runtime_in_use', reason: 'active_provider' });
  });

  it('toggle model in fallback → 409 via route', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    await llmStore.setProviderEnabled('opencode-zen', true);
    const active = await llmStore.upsertModel({ providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true });
    const fallback = await llmStore.upsertModel({ providerId: 'opencode-zen', modelId: 'zen-1', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true });
    let rt = await llmStore.getRuntime();
    rt = await llmStore.updateRuntime({ providerId: 'openai-api', modelId: active.id, expectedVersion: rt.version, updatedBy: ADMIN_EMAIL });
    rt = await llmStore.updateRuntime({ providerId: 'openai-api', modelId: active.id, fallbackProviderId: 'opencode-zen', fallbackModelId: fallback.id, expectedVersion: rt.version, updatedBy: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'POST',
      url: `/admin/agent/llm-config/models/${encodeURIComponent(fallback.id)}/toggle`,
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'agent.runtime_in_use', reason: 'fallback_model' });
  });

  it('delete active model → 409 via route', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    const m = await llmStore.upsertModel({ providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true });
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({ providerId: 'openai-api', modelId: m.id, expectedVersion: rt.version, updatedBy: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'DELETE',
      url: `/admin/agent/llm-config/models/${encodeURIComponent(m.id)}`,
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'agent.runtime_in_use', reason: 'active_model' });
  });

  it('delete active provider → 409 via route (not 500)', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    const m = await llmStore.upsertModel({ providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true });
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({ providerId: 'openai-api', modelId: m.id, expectedVersion: rt.version, updatedBy: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'DELETE',
      url: '/admin/agent/llm-config/providers/openai-api',
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'agent.runtime_in_use' });
  });

  it('PATCH enabled + eligibility together applies both', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-api',
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      payload: { enabled: true, eligibility: 'approved' },
    });
    expect(res.statusCode).toBe(200);
    const provider = res.json().provider;
    expect(provider.enabled).toBe(true);
    expect(provider.eligibility).toBe('approved');
  });

  it('PATCH disabling active provider → 409', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    const m = await llmStore.upsertModel({ providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true });
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({ providerId: 'openai-api', modelId: m.id, expectedVersion: rt.version, updatedBy: ADMIN_EMAIL });
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-api',
      headers: { cookie: adminCookie, origin: 'http://localhost:3000' },
      payload: { enabled: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'agent.runtime_in_use', reason: 'active_provider' });
  });

  it('internal returns null when active provider disabled', async () => {
    // Legacy disabled-active state is unreachable via guarded store paths
    // (toggle/upsert/updateRuntime all refuse it), so seed it directly.
    await app.close();
    await auth.close();
    const seedBase = createInMemoryLlmConfigStore();
    const providers = (await seedBase.listProviders()).map((p) =>
      p.id === 'openai-api' ? { ...p, enabled: false } : p,
    );
    await buildApp({
      providers,
      models: [
        {
          id: 'openai-api:gpt-4o',
          providerId: 'openai-api',
          modelId: 'gpt-4o',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
          retention: null,
          enabled: true,
        },
      ],
      runtime: { providerId: 'openai-api', modelId: 'openai-api:gpt-4o' },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/internal/agent/llm-config',
      headers: { 'x-agent-config-token': CONFIG_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.activeProvider).toBeNull();
    expect(data.activeModel).toBeNull();
    expect(data.activeDisabled).toBe(true);
    // Fail-closed: the runtime DTO exposes no usable active ids either,
    // so a consumer reading only active* fields cannot use the disabled pair.
    expect(data.runtime.activeProviderId).toBeNull();
    expect(data.runtime.activeModelId).toBeNull();
    expect(JSON.stringify(data)).not.toContain('OPENAI_API_KEY');
  });
});
