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

describe('Fase 1b F2 — zod on runtime mutations (RED)', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let llmStore: LlmConfigStore;
  const ADMIN_EMAIL = 'zod-admin@test.com';
  const CONFIG_TOKEN = 'test-secret-config-token-32-chars-minimum!';
  let adminCookie = '';

  const adminHeaders = () => ({ cookie: adminCookie, origin: 'http://localhost:3000' });

  beforeEach(async () => {
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
    llmStore = createInMemoryLlmConfigStore();
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
  });

  afterEach(async () => {
    await app.close();
    await auth.close();
  });

  it('activate rejects an invalid rolloutMode with 400 and reason', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/activate',
      headers: adminHeaders(),
      payload: { providerId: 'openai-api', modelId: 'openai-api:gpt-4o', rolloutMode: 'everywhere', expectedVersion: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_activate' });
    expect(res.json().reason).toBeDefined();
  });

  it('activate rejects a negative expectedVersion', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/activate',
      headers: adminHeaders(),
      payload: { providerId: 'openai-api', modelId: 'openai-api:gpt-4o', expectedVersion: -1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_activate' });
  });

  it('activate rejects a string expectedVersion', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/activate',
      headers: adminHeaders(),
      payload: { providerId: 'openai-api', modelId: 'openai-api:gpt-4o', expectedVersion: '2' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_activate' });
  });

  it('rollout rejects a canaryAllowlist with non-string entries', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/rollout',
      headers: adminHeaders(),
      payload: { rolloutMode: 'canary', canaryAllowlist: [1, 2], expectedVersion: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_rollout' });
  });

  it('rollout rejects a canaryAllowlist above the item cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/rollout',
      headers: adminHeaders(),
      payload: {
        rolloutMode: 'canary',
        canaryAllowlist: Array.from({ length: 33 }, (_, i) => `ws-${i}`),
        expectedVersion: 1,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_rollout' });
  });

  it('PATCH rejects unknown keys (strict shape)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-api',
      headers: adminHeaders(),
      payload: { enabled: true, bogus: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_provider' });
    expect(res.json().reason).toBeDefined();
  });

  it('PATCH rejects a secretAlias that does not belong to the stored kind', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-api',
      headers: adminHeaders(),
      payload: { secretAlias: 'ANTHROPIC_API_KEY' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_provider' });
    expect(String(res.json().reason ?? '')).toMatch(/openai-api/i);
    expect((await llmStore.getProvider('openai-api'))?.secretAlias).toBe('OPENAI_API_KEY');
  });

  it('PATCH still applies a valid enabled-only patch', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/admin/agent/llm-config/providers/openai-api',
      headers: adminHeaders(),
      payload: { enabled: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().provider.enabled).toBe(true);
  });

  it('fallback rejects providerId set with modelId null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/fallback',
      headers: adminHeaders(),
      payload: { providerId: 'openai-api', modelId: null, expectedVersion: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_fallback' });
  });

  it('security-epoch rejects a junk body (parameterless endpoint)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/security-epoch',
      headers: adminHeaders(),
      payload: { reason: 'junk-is-rejected' },
    });
    expect(res.statusCode).toBe(400);
  });
});
