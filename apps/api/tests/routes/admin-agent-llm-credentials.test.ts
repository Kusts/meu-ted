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
import { __resetCredentialVaultForTests } from '../../src/agent/llm-credentials.js';
import type { LlmConfigStore } from '../../src/agent/llm-config-store.js';

const TEST_KEY = 'sk-test-credential-abcdefghijklmnop-abcd';

describe('LLM credential CRUD mascarado + modelos remotos (refactor)', () => {
  let app: FastifyInstance;
  let auth: ReturnType<typeof createBetterAuth>;
  let llmStore: LlmConfigStore;
  const ADMIN_EMAIL = 'cred-admin@test.com';
  const CONFIG_TOKEN = 'test-secret-config-token-32-chars-minimum!';
  let adminCookie = '';
  let savedKimiKey: string | undefined;

  const adminHeaders = () => ({ cookie: adminCookie, origin: 'http://localhost:3000' });

  beforeEach(async () => {
    savedKimiKey = process.env.KIMI_API_KEY;
    delete process.env.KIMI_API_KEY;
    __resetCredentialVaultForTests();
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
    __resetCredentialVaultForTests();
    if (savedKimiKey === undefined) delete process.env.KIMI_API_KEY;
    else process.env.KIMI_API_KEY = savedKimiKey;
  });

  it('dryRun valida e mascara sem persistir (nunca devolve a key)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
      payload: { apiKey: TEST_KEY, dryRun: true },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.credential).toMatchObject({ providerId: 'kimi', configured: false });
    expect(body.credential.masked).toMatch(/…abcd$/);
    expect(JSON.stringify(body)).not.toContain(TEST_KEY);

    const status = await app.inject({
      method: 'GET',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
    });
    expect(status.json().credential.configured).toBe(false);
  });

  it('CRUD mascarado: salva, lê status mascarado, testa dry-run, remove', async () => {
    const set = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
      payload: { apiKey: TEST_KEY },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().credential).toMatchObject({ providerId: 'kimi', configured: true });
    expect(set.json().credential.masked).toMatch(/…abcd$/);
    expect(JSON.stringify(set.json())).not.toContain(TEST_KEY);

    const status = await app.inject({
      method: 'GET',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
    });
    expect(status.json().credential).toMatchObject({ configured: true });
    expect(status.json().credential.masked).toMatch(/…abcd$/);

    const test = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/kimi/test-connection',
      headers: adminHeaders(),
      payload: { dryRun: true },
    });
    expect(test.statusCode).toBe(200);
    expect(test.json()).toMatchObject({ ready: true, code: 'dry_run_ok', providerId: 'kimi' });

    const del = await app.inject({
      method: 'DELETE',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().credential.configured).toBe(false);

    const after = await app.inject({
      method: 'GET',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
    });
    expect(after.json().credential.configured).toBe(false);
  });

  it('rejeita key curta e nunca a reflete no erro', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
      payload: { apiKey: 'abc' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).not.toContain('abc');
  });

  it('codex (browser-session) não tem slot de API key: 422', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/openai-codex-subscription/credential',
      headers: adminHeaders(),
      payload: { apiKey: TEST_KEY },
    });
    expect(res.statusCode).toBe(422);
  });

  it('codex retorna lista vazia com entrada manual permitida (sem rede)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/agent/llm-config/providers/openai-codex-subscription/remote-models',
      headers: adminHeaders(),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ providerId: 'openai-codex-subscription', models: [], manualEntryAllowed: true });
  });

  it('remote-models sem credencial falha fechado com 409', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/agent/llm-config/providers/kimi/remote-models',
      headers: adminHeaders(),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'agent.provider_not_configured' });
  });

  it('a rota de credencial continua bloqueando injeção de baseUrl', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/agent/llm-config/providers/kimi/credential',
      headers: adminHeaders(),
      payload: { apiKey: TEST_KEY, baseUrl: 'https://evil.example.com' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'agent.invalid_parameters' });
  });
});
