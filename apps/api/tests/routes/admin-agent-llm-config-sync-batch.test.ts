import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { createBetterAuth } from '../../src/auth/better-auth.js';
import { registerAdminAgentLlmConfigRoutes } from '../../src/routes/admin-agent-llm-config.js';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';
import type { LlmConfigStore } from '../../src/agent/llm-config-store.js';

describe('M-08: sync-catalog em lote atômico com relatório determinístico', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let llmStore: LlmConfigStore;
  const ADMIN_EMAIL = 'sync-admin@test.com';
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
    llmStore = createInMemoryLlmConfigStore();
    await llmStore.upsertProvider({
      id: 'deepseek', kind: 'deepseek', transport: 'direct', authMode: 'api-key',
      secretAlias: 'DEEPSEEK_API_KEY',
    });
    await llmStore.setProviderEnabled('deepseek', true);
    app = Fastify({ logger: false });
    registerAdminAgentLlmConfigRoutes(app, {
      auth,
      store: llmStore,
      adminEmails: [ADMIN_EMAIL],
      agentRuntimeOrigin: 'https://agent.test.local',
      agentRuntimeToken: 'test-token',
      trustedOrigins: ['http://localhost:3000'],
      auditLog: () => {},
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await auth.close();
  });

  it('provider desconhecido no meio do lote: 404 SEM persistir os anteriores', async () => {
    const before = await llmStore.listModels();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/sync-catalog',
      headers: adminHeaders(),
      payload: {
        items: [
          { providerId: 'deepseek', modelId: 'deepseek-chat', protocol: 'chat-completions' },
          { providerId: 'no-such-provider', modelId: 'm', protocol: 'chat-completions' },
          { providerId: 'deepseek', modelId: 'deepseek-reasoner', protocol: 'chat-completions' },
        ],
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'agent.provider_not_found' });
    // Zero escrita: nenhum item do lote foi persistido.
    expect(await llmStore.listModels()).toEqual(before);
    expect(await llmStore.getModel('deepseek:deepseek-chat')).toBeNull();
  });

  it('lote válido com item incompatível: 200 com relatório determinístico', async () => {
    await llmStore.upsertProvider({
      id: 'anthropic', kind: 'anthropic', transport: 'direct', authMode: 'api-key',
      secretAlias: 'ANTHROPIC_API_KEY',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/sync-catalog',
      headers: adminHeaders(),
      payload: {
        items: [
          { providerId: 'deepseek', modelId: 'deepseek-chat', protocol: 'chat-completions' },
          { providerId: 'anthropic', modelId: 'claude-x', protocol: 'chat-completions' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, synced: 1 });
    const body = res.json() as { skipped?: Array<{ providerId?: string; modelId?: string; reason?: string }> };
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped?.[0]).toMatchObject({ providerId: 'anthropic', modelId: 'claude-x' });
    expect(String(body.skipped?.[0]?.reason ?? '')).toMatch(/compatible|protocol/i);
    expect(await llmStore.getModel('deepseek:deepseek-chat')).not.toBeNull();
    expect(await llmStore.getModel('anthropic:claude-x')).toBeNull();
  });

  it('lote vazio: no-op determinístico', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/sync-catalog',
      headers: adminHeaders(),
      payload: { items: [] },
    });
    expect(res.json()).toMatchObject({ ok: true, synced: 0, skipped: [] });
  });
});
