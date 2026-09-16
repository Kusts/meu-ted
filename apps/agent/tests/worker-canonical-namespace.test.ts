import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createAgentConnectionToken } from '../../api/src/auth/agent-connection-token.js';
import worker from '../src/worker.js';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const CONNECTION_SECRET = 'test-connection-secret-32-chars-minimum!!';
const SERVICE_TOKEN = 'test-service-token-32-chars-minimum!!';
const CANONICAL = '11111111-1111-4111-8111-111111111111';
const ALIAS = 'ws-alias-bruto';
const ACTOR = 'user-uuid-1';

const mintFor = (workspace: string, nowMs: number) =>
  createAgentConnectionToken({ sub: ACTOR, workspace, role: 'owner' }, CONNECTION_SECRET, nowMs);

/** Alias endpoint resolves ANY received id to the canonical household. */
const aliasFetch = (consumeStatus = 200) =>
  (async (url: unknown) => {
    const u = String(url);
    if (u.includes('/internal/workspace-alias/')) {
      return new Response(JSON.stringify({ canonicalHouseholdId: CANONICAL }), { status: 200 });
    }
    if (u.includes('/internal/agent/consume-token')) {
      return new Response(JSON.stringify({ ok: true, consumed: true }), { status: consumeStatus });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

describe('C-05: DO nomeado pelo canonical, nunca pelo alias bruto', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('rota finance: conectar pelo alias usa idFromName(canonical)', async () => {
    const token = await mintFor(CANONICAL, Date.now());
    globalThis.fetch = aliasFetch();
    const doFetch = vi.fn(async () => new Response('do'));
    const idFromName = vi.fn((name: string) => ({ name }));
    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
      FINANCE_CHAT_AGENT: { idFromName, get: vi.fn(() => ({ fetch: doFetch })) },
    } as unknown as WorkerEnv;

    const res = await worker.fetch(
      new Request(`https://worker.test/agents/finance-chat-agent/${ALIAS}/rpc/history`, {
        headers: { 'x-agent-connection-token': token },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(idFromName).toHaveBeenCalledTimes(1);
    expect(idFromName).toHaveBeenCalledWith(CANONICAL);
    expect(idFromName).not.toHaveBeenCalledWith(ALIAS);
  });

  it('alias e canonical alcançam o MESMO namespace de DO', async () => {
    globalThis.fetch = aliasFetch();
    const names: string[] = [];
    const doFetch = vi.fn(async () => new Response('do'));
    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((name: string) => {
          names.push(name);
          return { name };
        }),
        get: vi.fn(() => ({ fetch: doFetch })),
      },
    } as unknown as WorkerEnv;

    for (const pathId of [ALIAS, CANONICAL]) {
      const token = await mintFor(CANONICAL, Date.now());
      const res = await worker.fetch(
        new Request(`https://worker.test/agents/finance-chat-agent/${pathId}/rpc/history`, {
          headers: { 'x-agent-connection-token': token },
        }),
        env,
      );
      expect(res.status).toBe(200);
    }
    expect(names).toEqual([CANONICAL, CANONICAL]);
  });

  // T4.3: the retired legacy route case was removed with the route itself
  // (ARCH-V4-06b forbids the retired path literal even in tests).

  it('cross-workspace: token do ws-A na rota do ws-B nunca toca o DO', async () => {
    const token = await mintFor(CANONICAL, Date.now());
    const otherWs = '22222222-2222-4222-8222-222222222222';
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ canonicalHouseholdId: otherWs }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const idFromName = vi.fn((name: string) => ({ name }));
    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
      FINANCE_CHAT_AGENT: { idFromName, get: vi.fn() },
    } as unknown as WorkerEnv;

    const res = await worker.fetch(
      new Request(`https://worker.test/agents/finance-chat-agent/${otherWs}/rpc/history`, {
        headers: { 'x-agent-connection-token': token },
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(idFromName).not.toHaveBeenCalled();
  });
});
