import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { UIMessage } from 'agents/ai-chat-agent';
import { createAgentConnectionToken } from '../../api/src/auth/agent-connection-token.js';
import worker from '../src/worker.js';
import { FinanceChatAgent } from '../src/finance-chat-agent.js';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

const CONNECTION_SECRET = 'test-connection-secret-32-chars-minimum!!';
const SERVICE_TOKEN = 'test-service-token-32-chars-minimum!!';
const WS = '11111111-1111-4111-8111-111111111111';
const REAL_ACTOR = 'user-real';
const SPOOFED_ACTOR = 'attacker-spoofed';

const snapshotBody = {
  runtime: {
    singleton: 'active',
    version: 3,
    securityEpoch: 2,
    activeProviderId: 'opencode-zen',
    activeModelId: 'opencode-zen:zen-1',
    activeProtocol: 'chat-completions',
    activeRolloutPercentage: 100,
    activeRolloutMode: 'all',
    fallbackProviderId: null,
    fallbackModelId: null,
    updatedBy: null,
  },
  activeProvider: null,
  activeModel: null,
  fallbackProvider: null,
  fallbackModel: null,
  activeDisabled: false,
  fallbackDisabled: false,
};

const mint = (nowMs: number) =>
  createAgentConnectionToken({ sub: REAL_ACTOR, workspace: WS, role: 'owner' }, CONNECTION_SECRET, nowMs);

const workerFetchMock = () =>
  (async (url: unknown) => {
    const u = String(url);
    if (u.includes('/internal/workspace-alias/')) {
      return new Response(JSON.stringify({ canonicalHouseholdId: WS }), { status: 200 });
    }
    if (u.includes('/internal/agent/consume-token')) {
      return new Response(JSON.stringify({ ok: true, consumed: true }), { status: 200 });
    }
    if (u.includes('/internal/agent/llm-config')) {
      return new Response(JSON.stringify(snapshotBody), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

describe('C-06: actorId do payload nunca vira identidade', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('rota legada new-message com actorId forjado no body → 403, DO nunca tocado', async () => {
    const token = await mint(Date.now());
    globalThis.fetch = workerFetchMock();
    const financeFetch = vi.fn(async () => new Response('do'));
    const legacyFetch = vi.fn(async () => new Response('do'));
    const env = {
      API_ORIGIN: 'https://api.example.test',
      AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
      AGENT_AUTH_SERVICE_TOKEN: SERVICE_TOKEN,
      AGENT_CONFIG_TOKEN: 'config-test-token',
      AGENT: { idFromName: vi.fn((n: string) => ({ n })), get: vi.fn(() => ({ fetch: legacyFetch })) },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((n: string) => ({ n })),
        get: vi.fn(() => ({
          fetch: financeFetch,
          exportFullWorkspaceHistory: async () => ({ turns: [], messages: [] }),
          importLegacyHistory: async () => ({ success: true, importedCount: 0, skipped: true }),
        })),
      },
    } as unknown as WorkerEnv;

    const res = await worker.fetch(
      new Request(`https://worker.test/agents/workspace/${WS}/message`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-agent-connection-token': token },
        body: JSON.stringify({ content: 'olá', actorId: SPOOFED_ACTOR }),
      }),
      env,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe('agent.identity_mismatch');
    expect(financeFetch).not.toHaveBeenCalled();
    expect(legacyFetch).not.toHaveBeenCalled();
  });

  it('/rpc/chat com actorId forjado no body: headers autenticados vencem (memória/uso/atribuição)', async () => {
    const persisted: UIMessage[] = [];
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent & {
      messages: UIMessage[];
      persistMessages: (msgs: UIMessage[]) => Promise<void>;
    };
    agent.messages = [];
    agent.persistMessages = vi.fn(async (msgs: UIMessage[]) => {
      persisted.push(...msgs);
    });
    Object.defineProperty(agent, 'state', { value: { storage: {} }, writable: true, configurable: true });
    Object.defineProperty(agent, 'env', {
      value: {
        API_ORIGIN: 'https://api.example.test',
        AGENT_CONNECTION_TOKEN_SECRET: CONNECTION_SECRET,
        AGENT_CONFIG_TOKEN: 'config-test-token',
      },
      writable: true,
      configurable: true,
    });
    globalThis.fetch = (async (url: unknown) => {
      const u = String(url);
      if (u.includes('/internal/agent/llm-config')) {
        return new Response(JSON.stringify(snapshotBody), { status: 200 });
      }
      if (u.includes('/internal/agent/llm-relay')) {
        return new Response(JSON.stringify({ text: 'resposta do relay' }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const token = await mint(Date.now());
    const res = await agent.fetch(
      new Request('https://agent.test.local/rpc/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-agent-connection-token': token,
          'x-agent-actor': REAL_ACTOR,
          'x-agent-workspace': WS,
        },
        body: JSON.stringify({ text: 'qual meu saldo?', intentionId: 'intent-spoof-1', actorId: SPOOFED_ACTOR }),
      }),
    );
    expect(res.status).toBe(200);
    const userMsg = persisted.find((m) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect((userMsg!.metadata as { actorId?: string } | undefined)?.actorId).toBe(REAL_ACTOR);
    expect(JSON.stringify(persisted)).not.toContain(SPOOFED_ACTOR);
  });
});
