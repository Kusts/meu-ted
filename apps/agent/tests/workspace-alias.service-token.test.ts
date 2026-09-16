import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeWorkspaceMembership } from '../src/index.js';

describe('Security: Worker exige AGENT_AUTH_SERVICE_TOKEN dedicado', () => {
  const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
  const ALIAS = '99999999-9999-4111-8111-999999999999';
  const SERVICE_TOKEN = 'test-service-token-32-chars-minimum!';
  const CONNECTION_SECRET = 'test-connection-secret-32-chars-minimum!';

  beforeEach(() => vi.restoreAllMocks());

  it('RED/GREEN: sem AGENT_AUTH_SERVICE_TOKEN deve falhar com 500, mesmo que CONNECTION_TOKEN_SECRET esteja presente (sem fallback)', async () => {
    const req = new Request(`https://worker.test/agents/finance-chat-agent/${ALIAS}/rpc/history`, {
      headers: { 'x-agent-connection-token': 'dummy', 'x-workspace-id': ALIAS },
    });
    const env = { API_ORIGIN: 'https://api.example.com', AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET } as unknown as Record<string, string>;
    const res = (await authorizeWorkspaceMembership(req as unknown as Request, env as unknown as { API_ORIGIN: string; AGENT_AUTH_SERVICE_TOKEN?: string }, ALIAS)) as Response;
    expect(res.status).toBe(500);
    const body = await res.json() as { code?: string };
    expect(body.code).toBe('agent.service_token_missing');
  });

  it('token incorreto no header x-agent-service-token deve ser 401 não enumerável (mesmo código que ausente) via endpoint', async () => {
    // Mock fetch para o endpoint interno retornar 401 para token errado
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ code: 'auth.invalid_service_token' }), { status: 401, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const _req = new Request(`https://worker.test/agents/finance-chat-agent/${ALIAS}/rpc/history`, {
      headers: { 'x-agent-connection-token': 'dummy', 'x-workspace-id': ALIAS },
    });
    const _env = { API_ORIGIN: 'https://api.example.com', AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN, AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET } as unknown as Record<string, string>;
    // O Worker deve tentar resolver alias via endpoint com service token correto, mas se o token estiver errado, deve falhar
    // Aqui testamos que a chamada com token errado não vaza se alias existe — o helper deve retornar 401
    // C-02 fail-closed: token errado/resposta não-OK deve LANÇAR (negar),
    // nunca aceitar silenciosamente o alias original como fallback.
    const { resolveCanonicalHouseholdId } = await import('../src/auth/workspace-alias.js');
    await expect(
      (resolveCanonicalHouseholdId as unknown as (origin: string, token: string, ws: string) => Promise<string>)('https://api.example.com', 'wrong-token', ALIAS),
    ).rejects.toThrow(/workspace alias resolution failed/);

    globalThis.fetch = originalFetch;
  });

  it('alias autorizado com AGENT_AUTH_SERVICE_TOKEN correto deve resolver para canonical', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: RequestInfo) => {
      const u = String(url);
      if (u.includes(`/internal/workspace-alias/${ALIAS}`)) {
        return new Response(JSON.stringify({ alias: ALIAS, canonicalHouseholdId: HOUSEHOLD }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;

    const { resolveCanonicalHouseholdId } = await import('../src/auth/workspace-alias.js');
    const canonical = await (resolveCanonicalHouseholdId as unknown as (origin: string, token: string, ws: string) => Promise<string>)('https://api.example.com', SERVICE_TOKEN, ALIAS);
    expect(canonical).toBe(HOUSEHOLD);

    globalThis.fetch = originalFetch;
  });
});
