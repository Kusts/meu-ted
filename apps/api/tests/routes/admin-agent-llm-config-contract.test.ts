import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerRoutes } from '../../src/routes/index.js';
import { createInMemoryStores } from '../../src/writes/in-memory.js';
import { createInMemoryReadModelStoreFromState } from '../../src/read-models/store.js';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';
import { createInMemoryIdempotencyStore } from '../../src/writes/idempotency.js';
import { createInMemoryLlmConfigStore, type LlmConfigStore } from '../../src/agent/llm-config-postgres.js';

describe('Fase 1a contract — runtime DTO, kind/alias, zod, fail-closed (RED)', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let llmStore: LlmConfigStore;
  const ADMIN_EMAIL = 'contract-admin@test.com';
  const CONFIG_TOKEN = 'test-secret-config-token-32-chars-minimum!';
  let adminCookie = '';

  const adminHeaders = () => ({ cookie: adminCookie, origin: 'http://localhost:3000' });

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

  it('GET /admin/agent/llm-config returns runtime with active* names (B-C2 contract)', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    const model = await llmStore.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      rolloutMode: 'all',
      expectedVersion: rt.version,
      updatedBy: ADMIN_EMAIL,
    });

    const res = await app.inject({ method: 'GET', url: '/admin/agent/llm-config', headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.runtime.activeProviderId).toBe('openai-api');
    expect(data.runtime.activeModelId).toBe('openai-api:gpt-4o');
    expect(data.runtime.activeProtocol).toBe('chat-completions');
    expect(data.runtime.activeRolloutMode).toBe('all');
    expect(data.runtime).not.toHaveProperty('providerId');
    expect(data.runtime).not.toHaveProperty('modelId');
  });

  it('activate returns runtime DTO with active* names', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    await llmStore.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/activate',
      headers: adminHeaders(),
      payload: { providerId: 'openai-api', modelId: 'openai-api:gpt-4o', rolloutMode: 'all', expectedVersion: 1 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().runtime).toMatchObject({
      activeProviderId: 'openai-api',
      activeModelId: 'openai-api:gpt-4o',
      version: 2,
    });
  });

  it('POST /providers rejects secretAlias that does not belong to kind (B-H3 at origin)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers',
      headers: adminHeaders(),
      payload: {
        id: 'custom-anthropic',
        kind: 'anthropic',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'OPENCODE_ZEN_API_KEY',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_provider' });
    expect(String(res.json().reason ?? res.json().message)).toMatch(/anthropic/i);
    expect(await llmStore.getProvider('custom-anthropic')).toBeNull();
  });

  it('POST /providers rejects kind outside the enum with reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers',
      headers: adminHeaders(),
      payload: {
        id: 'unknown-kind',
        kind: 'unknown-kind',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'OPENAI_API_KEY',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_provider' });
    expect(res.json().reason).toBeDefined();
  });

  it('POST /providers rejects id with 200 chars', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers',
      headers: adminHeaders(),
      payload: {
        id: 'a'.repeat(200),
        kind: 'openai-api',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'OPENAI_API_KEY',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_provider' });
  });

  it('POST /models rejects protocol outside the contract enum with invalid_model', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/models',
      headers: adminHeaders(),
      payload: {
        providerId: 'openai-api',
        modelId: 'gpt-4o',
        protocol: 'carrier-pigeon',
        privacyClass: 'training_prohibited',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_model' });
  });

  it('POST /sync-catalog accepts empty items as no-op', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/sync-catalog',
      headers: adminHeaders(),
      payload: { items: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, synced: 0 });
  });

  it('POST /sync-catalog never disables an existing active model', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    const model = await llmStore.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await llmStore.setModelEnabled(model.id, true);
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/sync-catalog',
      headers: adminHeaders(),
      payload: {
        items: [{ providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'chat-completions', privacyClass: 'training_prohibited' }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, synced: 1 });
    expect((await llmStore.getModel(model.id))?.enabled).toBe(true);
  });

  it('POST /sync-catalog rejects 101 items', async () => {
    const items = Array.from({ length: 101 }, (_, i) => ({
      providerId: 'openai-api',
      modelId: `model-${i}`,
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
    }));
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/sync-catalog',
      headers: adminHeaders(),
      payload: { items },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_model' });
  });

  it('internal snapshot is fail-closed: disabled active exposes no usable id or secret (consumer view)', async () => {
    // Legacy disabled-active state is unreachable via guarded store paths,
    // so seed it directly.
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
    // Consumer projection (same logic as apps/agent runtime-config-client): only active* fields
    const consumerProviderId = typeof data.runtime?.activeProviderId === 'string' ? data.runtime.activeProviderId : null;
    const consumerModelId = typeof data.runtime?.activeModelId === 'string' ? data.runtime.activeModelId : null;
    expect(consumerProviderId).toBeNull();
    expect(consumerModelId).toBeNull();
    // No usable id or secret of the disabled item anywhere in the snapshot
    expect(JSON.stringify(data)).not.toContain('OPENAI_API_KEY');
  });

  it('internal snapshot exposes usable active slots with explicit flags when enabled', async () => {
    await llmStore.setProviderEnabled('openai-api', true);
    const model = await llmStore.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const rt = await llmStore.getRuntime();
    await llmStore.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      rolloutMode: 'all',
      expectedVersion: rt.version,
      updatedBy: ADMIN_EMAIL,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/internal/agent/llm-config',
      headers: { 'x-agent-config-token': CONFIG_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const data = res.json();
    expect(data.activeDisabled).toBe(false);
    expect(data.activeProvider).toMatchObject({ id: 'openai-api', secretAlias: 'OPENAI_API_KEY' });
    expect(data.activeModel).toMatchObject({ id: 'openai-api:gpt-4o', modelId: 'gpt-4o' });
    expect(data.runtime.activeProviderId).toBe('openai-api');
    expect(data.runtime.activeModelId).toBe('openai-api:gpt-4o');
  });
});
