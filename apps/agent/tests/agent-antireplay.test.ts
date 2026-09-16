import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { authorizeWorkspaceMembership } from '../src/index.js';
import { createAgentConnectionToken } from '../../api/src/auth/agent-connection-token.js';
import worker from '../src/worker.js';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const CONNECTION_SECRET = 'test-connection-secret-32-chars-minimum!!';
const SERVICE_TOKEN = 'test-service-token-32-chars-minimum!!';
const HOUSEHOLD = '11111111-1111-4111-8111-111111111111';
const ACTOR = 'user-uuid-1';

const mint = (nowMs: number) =>
  createAgentConnectionToken({ sub: ACTOR, workspace: HOUSEHOLD, role: 'owner' }, CONNECTION_SECRET, nowMs);

describe('C-01/C-02: anti-replay consumido + alias fail-closed no Worker', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('consome o jti uma única vez: segundo uso do mesmo token é replay (409 tratado)', async () => {
    const now = Date.now();
    const token = await mint(now);
    const seen = new Set<string>();
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ canonicalHouseholdId: HOUSEHOLD }), { status: 200 });
      }
      if (u.includes('/internal/agent/consume-token')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { jtiHash?: string };
        if (!body.jtiHash) return new Response('missing', { status: 400 });
        if (seen.has(body.jtiHash)) {
          return new Response(JSON.stringify({ ok: false, code: 'agent.token_replayed' }), { status: 409 });
        }
        seen.add(body.jtiHash);
        return new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
    } as unknown as { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string; AGENT_AUTH_SERVICE_TOKEN?: string };
    const req = () =>
      new Request(`https://worker.test/agents/finance-chat-agent/${HOUSEHOLD}/rpc/history`, {
        headers: { 'x-agent-connection-token': token },
      }) as unknown as Request;

    const first = await authorizeWorkspaceMembership(req(), env, HOUSEHOLD);
    expect(first).not.toBeInstanceOf(Response);

    const second = await authorizeWorkspaceMembership(req(), env, HOUSEHOLD);
    expect(second).toBeInstanceOf(Response);
    const res = second as unknown as Response;
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('agent.token_replayed');
  });

  it('falha fechada quando o consumo retorna erro não-replay (503)', async () => {
    const now = Date.now();
    const token = await mint(now);
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ canonicalHouseholdId: HOUSEHOLD }), { status: 200 });
      }
      return new Response('boom', { status: 500 });
    }) as unknown as typeof fetch;

    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
    } as unknown as { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string; AGENT_AUTH_SERVICE_TOKEN?: string };
    const out = await authorizeWorkspaceMembership(
      new Request(`https://worker.test/agents/finance-chat-agent/${HOUSEHOLD}/rpc/history`, {
        headers: { 'x-agent-connection-token': token },
      }) as unknown as Request,
      env,
      HOUSEHOLD,
    );
    expect(out).toBeInstanceOf(Response);
    expect((out as unknown as Response).status).toBe(503);
  });

  it('alias fail-closed: endpoint 500/timeout nega em vez de aceitar o alias original', async () => {
    const now = Date.now();
    const token = await mint(now);
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes('/internal/workspace-alias/')) {
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
    } as unknown as { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string; AGENT_AUTH_SERVICE_TOKEN?: string };
    const out = await authorizeWorkspaceMembership(
      new Request(`https://worker.test/agents/finance-chat-agent/${HOUSEHOLD}/rpc/history`, {
        headers: { 'x-agent-connection-token': token },
      }) as unknown as Request,
      env,
      HOUSEHOLD,
    );
    expect(out).toBeInstanceOf(Response);
    expect((out as unknown as Response).status).toBe(503);
  });

  it('H-07 spoof cross-workspace: token de ws-A na rota de ws-B → 403', async () => {
    const now = Date.now();
    const token = await mint(now);
    const otherWs = '22222222-2222-4222-8222-222222222222';
    const doFetch = vi.fn(async () => new Response('do'));
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ canonicalHouseholdId: otherWs }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
      FINANCE_CHAT_AGENT: { idFromName: vi.fn((name: string) => ({ name })), get: vi.fn(() => ({ fetch: doFetch })) },
    } as unknown as WorkerEnv;
    const res = await worker.fetch(
      new Request(`https://worker.test/agents/finance-chat-agent/${otherWs}/rpc/history`, {
        headers: { 'x-agent-connection-token': token },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(doFetch).not.toHaveBeenCalled();
  });

  it('M-09: consumo negado por revogação (403) nega o turno no Worker', async () => {
    const now = Date.now();
    const token = await mint(now);
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ canonicalHouseholdId: HOUSEHOLD }), { status: 200 });
      }
      if (u.includes('/internal/agent/consume-token')) {
        return new Response(
          JSON.stringify({ code: 'auth.workspace_forbidden', message: 'Access to workspace forbidden' }),
          { status: 403 },
        );
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
    } as unknown as { API_ORIGIN: string; AGENT_CONNECTION_TOKEN_SECRET?: string; AGENT_AUTH_SERVICE_TOKEN?: string };
    const out = await authorizeWorkspaceMembership(
      new Request(`https://worker.test/agents/finance-chat-agent/${HOUSEHOLD}/rpc/history`, {
        headers: { 'x-agent-connection-token': token },
      }) as unknown as Request,
      env,
      HOUSEHOLD,
    );
    expect(out).toBeInstanceOf(Response);
    const res = out as unknown as Response;
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('agent.workspace_forbidden');
  });
});
