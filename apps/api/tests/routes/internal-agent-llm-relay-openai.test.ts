import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAgentLlmRelayRoutes } from '../../src/routes/internal-agent-llm-relay.js';

const ADMIN_TOKEN = 'test-relay-admin-token-32-chars-min!';
const OPENAI_KEY = 'test-openai-key';
const headers = { 'x-agent-runtime-admin-token': ADMIN_TOKEN, origin: 'http://localhost:3000' };

const openaiOk = (text = 'hello from gpt') =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: text } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('H-02 — paridade real de OpenAI no relay', () => {
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

  it('openai-api executa via chat/completions com Bearer e retorna o texto', async () => {
    process.env.RELAY_ALLOWED_MODELS = 'gpt-4o-mini';
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, openaiApiKey: OPENAI_KEY });
    await app.ready();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(openaiOk());

    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'openai-api', model: 'gpt-4o-mini', prompt: 'hi', system: 'sys' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ text: 'hello from gpt', provider: 'openai-api' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
    const sentHeaders = (init as RequestInit).headers as Record<string, string>;
    expect(sentHeaders.authorization).toBe(`Bearer ${OPENAI_KEY}`);
    const body = JSON.parse(String((init as RequestInit).body)) as {
      model?: string; messages?: Array<{ role?: string; content?: string }>;
    };
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);
  });

  it('openai-api sem chave falha fechado (503) sem chamar upstream', async () => {
    process.env.RELAY_ALLOWED_MODELS = 'gpt-4o-mini';
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN });
    await app.ready();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'openai-api', model: 'gpt-4o-mini', prompt: 'hi' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ code: 'agent.provider_not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('alias divergente (openai sem -api) é rejeitado pelo contrato (400)', async () => {
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, openaiApiKey: OPENAI_KEY });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'openai', model: 'gpt-4o-mini', prompt: 'hi' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('upstream OpenAI 401 vira 502 agent.provider_auth sem vazar a chave', async () => {
    process.env.RELAY_ALLOWED_MODELS = 'gpt-4o-mini';
    registerAgentLlmRelayRoutes(app, { adminToken: ADMIN_TOKEN, openaiApiKey: OPENAI_KEY });
    await app.ready();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), { status: 401 }),
    );
    const res = await app.inject({
      method: 'POST', url: '/internal/agent/llm-relay', headers,
      payload: { provider: 'openai-api', model: 'gpt-4o-mini', prompt: 'hi' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ code: 'agent.provider_auth' });
    expect(JSON.stringify(res.json())).not.toContain(OPENAI_KEY);
  });
});
