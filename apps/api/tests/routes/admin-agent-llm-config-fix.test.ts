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

describe('Fase 1b-FIX routes (items 3/8)', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let llmStore: LlmConfigStore;
  const ADMIN_EMAIL = 'fix-admin@test.com';
  const CONFIG_TOKEN = 'test-secret-config-token-32-chars-minimum!';
  let adminCookie = '';

  const adminHeaders = () => ({ cookie: adminCookie, origin: 'http://localhost:3000' });

  const buildApp = async (
    llmSeed?: Parameters<typeof createInMemoryLlmConfigStore>[0],
    adminLlmAuditLog?: (event: { action: string; actor: string }) => void,
  ) => {
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
      ...(adminLlmAuditLog ? { adminLlmAuditLog } : {}),
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

  it('item 3: POST /providers with an unsupported kind is rejected with 422 kind_unsupported', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers',
      headers: adminHeaders(),
      payload: {
        id: 'codex-new',
        kind: 'openai-codex-subscription',
        transport: 'private-broker',
        authMode: 'chatgpt-browser',
        secretAlias: null,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'agent.kind_unsupported' });
    expect(res.json().reason).toBeDefined();
    expect(await llmStore.getProvider('codex-new')).toBeNull();
  });

  it('item 3: PATCH cannot promote an unsupported provider (enabled)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-codex-subscription',
      headers: adminHeaders(),
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'agent.kind_unsupported' });
    expect((await llmStore.getProvider('openai-codex-subscription'))?.enabled).toBe(false);
  });

  it('item 3: PATCH cannot promote an unsupported provider (eligibility)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-codex-subscription',
      headers: adminHeaders(),
      payload: { eligibility: 'approved' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'agent.kind_unsupported' });
    expect((await llmStore.getProvider('openai-codex-subscription'))?.eligibility).toBe(
      'experimental_blocked',
    );
  });

  it('item 3: activate rejects an approved+enabled unsupported provider/model pair', async () => {
    // Reach approved+enabled via direct store writes (routes refuse each step).
    await llmStore.upsertProvider({
      id: 'openai-codex-subscription',
      kind: 'openai-codex-subscription',
      transport: 'private-broker',
      authMode: 'chatgpt-browser',
      secretAlias: null,
      eligibility: 'approved',
    });
    await llmStore.setProviderEnabled('openai-codex-subscription', true);
    const model = await llmStore.upsertModel({
      providerId: 'openai-codex-subscription',
      modelId: 'codex-mini',
      protocol: 'responses',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await llmStore.setModelEnabled(model.id, true);
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/activate',
      headers: adminHeaders(),
      payload: {
        providerId: 'openai-codex-subscription',
        modelId: model.id,
        expectedVersion: 1,
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'agent.activation_blocked' });
    expect(String(res.json().reason ?? '')).toMatch(/executable|support/i);
  });

  it('Fase 3 item 2: activate rejects a kind/protocol mismatch (anthropic + chat-completions)', async () => {
    // Creation of the mismatched pair is allowed; activation is not.
    const p = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers',
      headers: adminHeaders(),
      payload: {
        id: 'anthropic',
        kind: 'anthropic',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'ANTHROPIC_API_KEY',
      },
    });
    expect(p.statusCode).toBe(201);
    for (const payload of [{ enabled: true }, { eligibility: 'approved' }]) {
      const r = await app.inject({
        method: 'PATCH',
        url: '/admin/agent/llm-config/providers/anthropic',
        headers: adminHeaders(),
        payload,
      });
      expect(r.statusCode).toBe(200);
    }
    const m = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/models',
      headers: adminHeaders(),
      payload: {
        providerId: 'anthropic',
        modelId: 'claude-x',
        protocol: 'chat-completions',
        privacyClass: 'training_prohibited',
      },
    });
    expect(m.statusCode).toBe(201);
    const modelId = String(m.json().model.id);
    const t = await app.inject({
      method: 'POST',
      url: `/admin/agent/llm-config/models/${encodeURIComponent(modelId)}/toggle`,
      headers: adminHeaders(),
      payload: { enabled: true },
    });
    expect(t.statusCode).toBe(200);
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/activate',
      headers: adminHeaders(),
      payload: { providerId: 'anthropic', modelId, expectedVersion: 1 },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'agent.activation_blocked' });
    expect(String(res.json().reason ?? '')).toMatch(/not compatible/);
  });

  it('item 8: toggle rejects unknown keys with a strict schema', async () => {
    for (const url of [
      '/admin/agent/llm-config/providers/openai-api/toggle',
      '/admin/agent/llm-config/models/openai-api%3Agpt-4o/toggle',
    ]) {
      const res = await app.inject({
        method: 'POST',
        url,
        headers: adminHeaders(),
        payload: { enabled: true, bogus: 1 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().reason).toBeDefined();
    }
  });

  it('item 8: toggle rejects missing enabled', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/openai-api/toggle',
      headers: adminHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('item 8: test-connection validates its body and stays an explicit stub', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/test-connection',
      headers: adminHeaders(),
      payload: { providerId: 'openai-api' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ ready: false, code: 'not_configured' });

    const bad = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/test-connection',
      headers: adminHeaders(),
      payload: { providerId: 'a'.repeat(200) },
    });
    expect(bad.statusCode).toBe(400);

    const junk = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/test-connection',
      headers: adminHeaders(),
      payload: { bogus: [1, 2, 3] },
    });
    expect(junk.statusCode).toBe(400);
  });

  it('item 6: PATCH demoting eligibility of the active provider is rejected with 409', async () => {
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
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-api',
      headers: adminHeaders(),
      payload: { eligibility: 'candidate' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'agent.runtime_in_use', reason: 'active_provider' });
    expect((await llmStore.getProvider('openai-api'))?.eligibility).toBe('approved');
  });

  it('item 6: sync-catalog skips a conflicting entry instead of mutating the active model', async () => {
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
        items: [{ providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'responses', privacyClass: 'training_prohibited' }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, synced: 0 });
    expect((await llmStore.getModel(model.id))?.protocol).toBe('chat-completions');
  });

  it('item 3: internal projection marks an unsupported active pair disabled/fail-closed', async () => {
    await app.close();
    await auth.close();
    const seedBase = createInMemoryLlmConfigStore();
    const providers = (await seedBase.listProviders()).map((p) =>
      p.id === 'openai-codex-subscription' ? { ...p, enabled: true, eligibility: 'approved' as const } : p,
    );
    await buildApp({
      providers,
      models: [
        {
          id: 'openai-codex-subscription:codex-mini',
          providerId: 'openai-codex-subscription',
          modelId: 'codex-mini',
          protocol: 'responses',
          privacyClass: 'training_prohibited',
          retention: null,
          enabled: true,
        },
      ],
      runtime: { providerId: 'openai-codex-subscription', modelId: 'openai-codex-subscription:codex-mini' },
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
    expect(data.runtime.activeProviderId).toBeNull();
    expect(data.runtime.activeModelId).toBeNull();
  });

  it('Fase 3 item 2 (R3): internal projection fails closed on kind/protocol mismatch', async () => {
    await app.close();
    await auth.close();
    // Legacy/misconfigured row: anthropic is executable+enabled, but the
    // model speaks chat-completions. updateRuntime would refuse this pair,
    // so the row is seeded directly to prove the read projection revalidates.
    await buildApp({
      providers: [
        {
          id: 'anthropic',
          kind: 'anthropic',
          transport: 'direct',
          authMode: 'api-key',
          secretAlias: 'ANTHROPIC_API_KEY',
          enabled: true,
          eligibility: 'approved',
          runtimeStatus: 'ready',
        },
      ],
      models: [
        {
          id: 'anthropic:claude-x',
          providerId: 'anthropic',
          modelId: 'claude-x',
          protocol: 'chat-completions',
          privacyClass: 'training_prohibited',
          retention: null,
          enabled: true,
        },
      ],
      runtime: { providerId: 'anthropic', modelId: 'anthropic:claude-x' },
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
    expect(data.runtime.activeProviderId).toBeNull();
    expect(data.runtime.activeModelId).toBeNull();
    expect(data.runtime.activeProtocol).toBeNull();
  });

  it('Fase 3 item 9: sensitive admin GET emits an audit event without secrets', async () => {
    await app.close();
    await auth.close();
    const events: Array<Record<string, unknown>> = [];
    await buildApp(undefined, (e) => {
      events.push(e as unknown as Record<string, unknown>);
    });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/agent/llm-config',
      headers: adminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'admin.llm-config.read',
      actor: ADMIN_EMAIL,
    });
    expect(typeof events[0]?.['version']).toBe('number');
    expect(typeof events[0]?.['securityEpoch']).toBe('number');
    const keys = Object.keys(events[0] ?? {}).join(' ');
    expect(keys).not.toMatch(/secret|token|apiKey|alias/i);
  });

  it('Fase 3 item 9: a failing audit sink never breaks the admin read', async () => {
    await app.close();
    await auth.close();
    await buildApp(undefined, () => {
      throw new Error('sink down');
    });
    const res = await app.inject({
      method: 'GET',
      url: '/admin/agent/llm-config',
      headers: adminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().providers).toBeDefined();
  });

  it('Fase 3 item 2 (R3): internal projection fails closed on unapproved active provider', async () => {
    await app.close();
    await auth.close();
    await buildApp({
      providers: [
        {
          id: 'openai-api',
          kind: 'openai-api',
          transport: 'direct',
          authMode: 'api-key',
          secretAlias: 'OPENAI_API_KEY',
          enabled: true,
          eligibility: 'experimental_blocked',
          runtimeStatus: 'ready',
        },
      ],
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
    expect(data.runtime.activeProviderId).toBeNull();
    expect(data.runtime.activeModelId).toBeNull();
  });
});
