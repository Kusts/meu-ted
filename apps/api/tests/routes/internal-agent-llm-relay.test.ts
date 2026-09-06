import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgentLlmRelayRoutes } from '../../src/routes/internal-agent-llm-relay.js';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';

const ADMIN_TOKEN = 'test-relay-admin-token-32-chars-min!';
const ZEN_KEY = 'test-zen-key';

const headers = { 'x-agent-runtime-admin-token': ADMIN_TOKEN, origin: 'http://localhost:3000' };

const upstreamOk = () =>
  new Response(
    JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('Fase 2 item 8 — dynamic relay allowlist (RED)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    delete process.env.RELAY_ALLOWED_MODELS;
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    delete process.env.RELAY_ALLOWED_MODELS;
    vi.restoreAllMocks();
    await app.close();
  });

  it('passes a DB-enabled model and blocks a disabled one', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const on = await store.upsertModel({
      providerId: 'openai-api', modelId: 'db-on', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true,
    });
    await store.setModelEnabled(on.id, true);
    await store.upsertModel({
      providerId: 'openai-api', modelId: 'db-off', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: false,
    });
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY, llmConfigStore: store });
    await app.ready();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamOk());

    const ok = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'db-on', prompt: 'hi' },
    });
    expect(ok.statusCode).toBe(200);

    const blocked = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'db-off', prompt: 'hi' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({ code: 'agent.model_not_allowlisted' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('env override wins over the DB list', async () => {
    process.env.RELAY_ALLOWED_MODELS = 'custom-env-model';
    const store = createInMemoryLlmConfigStore();
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY, llmConfigStore: store });
    await app.ready();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamOk());

    const ok = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'custom-env-model', prompt: 'hi' },
    });
    expect(ok.statusCode).toBe(200);

    const blocked = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'muse-spark-1.2-contributor-free', prompt: 'hi' },
    });
    expect(blocked.statusCode).toBe(403);
  });

  it('falls back to the built-in allowlist without env or store', async () => {
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY });
    await app.ready();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstreamOk());

    const ok = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'muse-spark-1.2-contributor-free', prompt: 'hi' },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('caches the DB list and refetches after TTL expiry', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const m = await store.upsertModel({
      providerId: 'openai-api', modelId: 'cached-model', protocol: 'chat-completions', privacyClass: 'training_prohibited', enabled: true,
    });
    await store.setModelEnabled(m.id, true);
    let now = 1_000_000;
    const listSpy = vi.spyOn(store, 'listModels');
    registerAgentLlmRelayRoutes(app, {
      adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY, llmConfigStore: store, cacheTtlMs: 60_000, now: () => now,
    });
    await app.ready();
    // Fresh Response per call: a Response body can only be consumed once.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(upstreamOk()));
    const payload = { provider: 'opencode-zen', model: 'cached-model', prompt: 'hi' };

    expect((await app.inject({ method: 'POST', url: '/internal/agent/llm-relay', headers, payload })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/internal/agent/llm-relay', headers, payload })).statusCode).toBe(200);
    expect(listSpy).toHaveBeenCalledTimes(1);

    now += 61_000;
    expect((await app.inject({ method: 'POST', url: '/internal/agent/llm-relay', headers, payload })).statusCode).toBe(200);
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('fail-closed: store failure returns 503 without silent fallback (Fase 3 item 5/D3)', async () => {
    const store = createInMemoryLlmConfigStore();
    vi.spyOn(store, 'listModels').mockRejectedValueOnce(new Error('db down'));
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY, llmConfigStore: store });
    await app.ready();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'anything', prompt: 'hi' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'agent.relay_allowlist_unavailable' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('blocks an enabled model whose provider is disabled (Fase 3 item 5/D3)', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.upsertProvider({
      id: 'zen-extra', kind: 'opencode-zen', transport: 'direct', authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY', enabled: false, eligibility: 'approved',
    });
    const m = await store.upsertModel({
      providerId: 'zen-extra', modelId: 'orphan-model', protocol: 'chat-completions',
      privacyClass: 'training_prohibited', enabled: true,
    });
    await store.setModelEnabled(m.id, true);
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY, llmConfigStore: store });
    await app.ready();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(upstreamOk()));
    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'orphan-model', prompt: 'hi' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'agent.model_not_allowlisted' });
  });

  it('clears its timer when the upstream request fails (Fase 3 item 1)', async () => {
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY });
    await app.ready();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('fetch failed'));
      const res = await app.inject({
        method: 'POST', url: '/internal/agent/llm-relay', headers,
        payload: { provider: 'opencode-zen', model: 'muse-spark-1.2-contributor-free', prompt: 'hi' },
      });
      expect(res.statusCode).toBe(504);
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('aborts hung upstream headers within the request timeout (Fase 3 item 1)', async () => {
    registerAgentLlmRelayRoutes(app, {
      adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY, requestTimeoutMs: 50,
    });
    await app.ready();
    // Hanging fetch that honors abort like the real one.
    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'muse-spark-1.2-contributor-free', prompt: 'hi' },
    });
    expect(res.statusCode).toBe(504);
    expect(res.json()).toMatchObject({ code: 'agent.provider_timeout' });
  }, 10_000);

  it('aborts a slow upstream body within the request timeout (Fase 3 item 1)', async () => {
    registerAgentLlmRelayRoutes(app, {
      adminToken: ADMIN_TOKEN, zenApiKey: ZEN_KEY, requestTimeoutMs: 50,
    });
    await app.ready();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
    } as unknown as Response);
    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'opencode-zen', model: 'muse-spark-1.2-contributor-free', prompt: 'hi' },
    });
    expect(res.statusCode).toBe(504);
    expect(res.json()).toMatchObject({ code: 'agent.provider_timeout' });
  }, 10_000);
});
