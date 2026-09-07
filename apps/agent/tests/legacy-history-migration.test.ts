import { describe, expect, it, vi, afterEach } from 'vitest';
import type { UIMessage } from 'agents/ai-chat-agent';
import {
  transformLegacyMessages,
  computeHistoryHash,
  migrateLegacyHistory,
  type LegacyFullExport,
} from '../src/migration/legacy-history.js';
import { FinanceChatAgent } from '../src/finance-chat-agent.js';
import worker from '../src/worker.js';
import { createAgentConnectionToken } from '../../api/src/auth/agent-connection-token.js';

type WorkerEnv = Parameters<typeof worker.fetch>[1];

describe('Legacy History Migration & Worker Consistency (Task 8 Refinement)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const sampleExport: LegacyFullExport = {    version: 1,
    workspaceId: 'ws-test-123',
    turns: [
      { id: 'turn-1', actor_id: 'user-a', status: 'completed', attempts: 1, tokens_used: 10 },
      { id: 'turn-2', actor_id: 'user-b', status: 'completed', attempts: 1, tokens_used: 15 },
    ],
    messages: [
      {
        id: 'msg-1',
        actor_id: 'user-a',
        role: 'user',
        content_json: JSON.stringify('Olá TED, qual meu saldo? api_key: secret-abc123'),
        created_at: '2026-08-20T10:00:00.000Z',
      },
      {
        id: 'msg-1:assistant',
        actor_id: 'agent',
        role: 'assistant',
        content_json: JSON.stringify('Seu saldo é R$ 1.500,00.'),
        created_at: '2026-08-20T10:00:01.000Z',
      },
      {
        id: 'msg-2',
        actor_id: 'user-b',
        role: 'user',
        content_json: JSON.stringify('E as contas de amanhã?'),
        created_at: '2026-08-20T10:05:00.000Z',
      },
    ],
    hasInFlightTurns: false,
  };

  // C-01/C-02: Worker auth resolves the canonical workspace and consumes
  // the single-use token before routing — mock both internal endpoints
  // (always-200 consumption: each case mints/uses its own token).
  const mockWorkerAuth = (workspaceId: string) => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (info) => {
      const url = String(info);
      if (url.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ canonicalHouseholdId: workspaceId }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/internal/agent/consume-token')) {
        return new Response(JSON.stringify({ ok: true, consumed: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('unexpected upstream', { status: 500 });
    });
  };

  const createMockSql = () => {
    const memory = new Map<string, Array<Record<string, unknown>>>();
    const executedQueries: string[] = [];
    return {
      executedQueries,
      exec: <T = Record<string, unknown>>(query: string, ...params: unknown[]): Iterable<T> => {
        executedQueries.push(query);
        if (query.includes('CREATE TABLE')) return [] as Iterable<T>;
        if (query.includes('SELECT migration_hash')) {
          const rows = memory.get('_history_migration_marker') ?? [];
          return rows as unknown as Iterable<T>;
        }
        if (query.includes('INSERT INTO _history_migration_marker')) {
          const [workspace_id, migration_hash, imported_count] = params as [string, string, number];
          memory.set('_history_migration_marker', [{ workspace_id, migration_hash, imported_count }]);
          return [] as Iterable<T>;
        }
        return [] as Iterable<T>;
      },
    };
  };

  it('(1) FinanceChatAgent.importLegacyHistory real persists UIMessage v5 strictly with parts & server-side metadata, and GET /rpc/history sorts chronologically by metadata.createdAt even when this.messages is reversed', async () => {
    const mockSql = createMockSql();
    const persistedMessages: UIMessage[] = [];

    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent & {
      messages: UIMessage[];
      persistMessages: (msgs: UIMessage[]) => Promise<void>;
    };
    agent.messages = persistedMessages;
    agent.persistMessages = vi.fn(async (msgs: UIMessage[]) => {
      persistedMessages.push(...msgs);
    });

    Object.defineProperty(agent, 'state', {
      value: { storage: { sql: mockSql } },
      writable: true,
      configurable: true,
    });

    const res = await agent.importLegacyHistory(sampleExport);
    expect(res.success).toBe(true);
    expect(res.importedCount).toBe(3);

    expect(persistedMessages).toHaveLength(3);
    for (const msg of persistedMessages) {
      // Must NOT have non-canonical top-level fields
      expect(msg).not.toHaveProperty('content');
      expect(msg).not.toHaveProperty('text');
      expect(msg).not.toHaveProperty('actorId');
      expect(msg).not.toHaveProperty('createdAt');
      // Must have canonical UIMessage fields
      expect(msg).toHaveProperty('id');
      expect(msg).toHaveProperty('role');
      expect(msg).toHaveProperty('parts');
      expect(msg).toHaveProperty('metadata');
      expect(msg.metadata).toHaveProperty('actorId');
      expect(msg.metadata).toHaveProperty('workspaceId');
      expect(msg.metadata).toHaveProperty('createdAt');
    }

    // Now deliberately reverse order in agent.messages to test sorting
    agent.messages = [...persistedMessages].reverse();

    const historyReq = new Request('https://agent.test.local/rpc/history', {
      method: 'GET',
      headers: {
        'x-agent-actor': 'user-a',
        'x-agent-workspace': 'ws-test-123',
      },
    });

    const historyRes = await agent.fetch(historyReq);
    expect(historyRes.status).toBe(200);
    const body = (await historyRes.json()) as { items: Array<{ id: string; createdAt?: string }> };
    expect(body.items).toHaveLength(3);
    // Chronological order verification
    expect(body.items[0]!.id).toBe('msg-1');
    expect(body.items[1]!.id).toBe('msg-1:assistant');
    expect(body.items[2]!.id).toBe('msg-2');
  });

  it('(2) Worker fails closed with 503 if legacy stub or Finance stub lacks required export/import methods, without calling fetch or leaking sentinel error', async () => {
    const SECRET = 'secret-for-testing-purposes-at-least-32-chars!';
    const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
    mockWorkerAuth(WORKSPACE_ID);
    const GENUINE_USER = 'user-authenticated-uuid';

    const token = await createAgentConnectionToken(
      {
        sub: GENUINE_USER,
        workspace: WORKSPACE_ID,
        role: 'owner',
      },
      SECRET,
    );

    const financeFetchSpy = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));

    // Case 2a: AGENT stub does NOT expose exportFullWorkspaceHistory
    const mockEnvNoLegacyExport: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => new Response('legacy agent')),
        })),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          importLegacyHistory: vi.fn(async () => ({ success: true, importedCount: 0, skipped: true })),
          fetch: financeFetchSpy,
        })),
      },
      API_ORIGIN: 'https://api.test.local',
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
      AGENT_AUTH_SERVICE_TOKEN: 'test-auth-service-token',
    };

    const req1 = new Request(
      `https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`,
      {
        method: 'GET',
        headers: {
          'x-agent-connection-token': token,
          origin: 'https://pi-finance-pwa.walissonead.workers.dev',
        },
      },
    );

    const res1 = await worker.fetch(req1, mockEnvNoLegacyExport);    expect(res1.status).toBe(503);
    const body1 = (await res1.json()) as { code: string };
    expect(body1.code).toBe('agent.history_migration_failed');
    expect(financeFetchSpy).not.toHaveBeenCalled();

    // Case 2b: FINANCE_CHAT_AGENT stub does NOT expose importLegacyHistory
    const mockEnvNoFinanceImport: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          exportFullWorkspaceHistory: vi.fn(async () => sampleExport),
          fetch: vi.fn(async () => new Response('legacy agent')),
        })),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          fetch: financeFetchSpy,
        })),
      },
      API_ORIGIN: 'https://api.test.local',
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
      AGENT_AUTH_SERVICE_TOKEN: 'test-auth-service-token',
    };

    const req2 = new Request(
      `https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`,
      {
        method: 'GET',
        headers: {
          'x-agent-connection-token': token,
          origin: 'https://pi-finance-pwa.walissonead.workers.dev',
        },
      },
    );

    const res2 = await worker.fetch(req2, mockEnvNoFinanceImport);
    expect(res2.status).toBe(503);
    const body2 = (await res2.json()) as { code: string };
    expect(body2.code).toBe('agent.history_migration_failed');
    expect(financeFetchSpy).not.toHaveBeenCalled();

    // Case 2c: Exception thrown with sentinel error (secret api key) -> must be redacted
    const mockEnvSentinelError: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          exportFullWorkspaceHistory: vi.fn(async () => {
            throw new Error('Database crash with api_key: secret-sentinel-leak-999');
          }),
          fetch: vi.fn(async () => new Response('legacy agent')),
        })),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          importLegacyHistory: vi.fn(async () => ({ success: true, importedCount: 0, skipped: true })),
          fetch: financeFetchSpy,
        })),
      },
      API_ORIGIN: 'https://api.test.local',
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
      AGENT_AUTH_SERVICE_TOKEN: 'test-auth-service-token',
    };

    const req3 = new Request(
      `https://agent.test.local/agents/finance-chat-agent/${WORKSPACE_ID}/rpc/history`,
      {
        method: 'GET',
        headers: {
          'x-agent-connection-token': token,
          origin: 'https://pi-finance-pwa.walissonead.workers.dev',
        },
      },
    );

    const res3 = await worker.fetch(req3, mockEnvSentinelError);
    expect(res3.status).toBe(503);
    const body3 = (await res3.json()) as { code: string; message: string };
    expect(body3.code).toBe('agent.history_migration_failed');
    expect(body3.message).not.toContain('secret-sentinel-leak-999');
    expect(body3.message).toContain('[REDACTED]');
    expect(financeFetchSpy).not.toHaveBeenCalled();
  });

  it('(3) structural JSON hash prevents delimiter collision in content_json values', () => {
    // Delimiter collision test: If hash used naive `${id}:${actor}:${role}:${created_at}:${content}` with ':' or '|'
    const msgA = [
      {
        id: 'msg-1:user-a',
        actor_id: 'user',
        role: 'user',
        created_at: '2026-08-20',
        content_json: 'hello',
      },
      {
        id: 'msg-2',
        actor_id: 'user-b',
        role: 'user',
        created_at: '2026-08-20',
        content_json: 'world',
      },
    ];

    const msgB = [
      {
        id: 'msg-1',
        actor_id: 'user-a:user',
        role: 'user',
        created_at: '2026-08-20',
        content_json: 'hello',
      },
      {
        id: 'msg-2',
        actor_id: 'user-b',
        role: 'user',
        created_at: '2026-08-20',
        content_json: 'world',
      },
    ];

    const hashA = computeHistoryHash(msgA);
    const hashB = computeHistoryHash(msgB);
    expect(hashA).not.toBe(hashB);
  });

  it('(4) legacy POST /agents/workspace/:workspace/message when configured passes through the same migration gate before calling Finance', async () => {
    const SECRET = 'secret-for-testing-purposes-at-least-32-chars!';
    const WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
    const GENUINE_USER = 'user-authenticated-uuid';

    const token = await createAgentConnectionToken(
      {
        sub: GENUINE_USER,
        workspace: WORKSPACE_ID,
        role: 'owner',
      },
      SECRET,
    );

    // Mock runtime config as configured (plus C-01/C-02 worker auth endpoints)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (info) => {
      const url = String(info);
      if (url.includes('/internal/workspace-alias/')) {
        return new Response(JSON.stringify({ canonicalHouseholdId: WORKSPACE_ID }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/internal/agent/consume-token')) {
        return new Response(JSON.stringify({ ok: true, consumed: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('/internal/agent/llm-config')) {
        return new Response(JSON.stringify({
          runtime: {
            singleton: 'active',
            version: 2,
            securityEpoch: 1,
            activeProviderId: 'opencode-zen',
            activeModelId: 'opencode-zen:zen-free',
            activeProtocol: 'chat-completions',
            activeRolloutPercentage: 100,
            activeRolloutMode: 'all',
            canaryAllowlist: [],
            fallbackProviderId: null,
            fallbackModelId: null,
            updatedBy: 'admin@test.com',
          },
          activeProvider: {
            id: 'opencode-zen',
            kind: 'opencode-zen',
            transport: 'direct',
            authMode: 'api-key',
            secretAlias: 'OPENCODE_ZEN_API_KEY',
            serviceAlias: null,
            eligibility: 'approved',
          },
          activeModel: {
            id: 'opencode-zen:zen-free',
            modelId: 'zen-free',
            protocol: 'chat-completions',
            privacyClass: 'training_prohibited',
          },
          fallbackProvider: null,
          fallbackModel: null,
          activeDisabled: false,
          fallbackDisabled: false,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('Not found', { status: 404 });
    });

    const legacyExportSpy = vi.fn(async (_wsId?: string) => sampleExport);
    const financeImportSpyBlocked = vi.fn(async () => ({
      success: false,
      importedCount: 0,
      skipped: false,
      reason: 'migration_blocked_turns_in_flight: active turns in progress',
    }));
    const financeFetchSpy = vi.fn(async () => new Response(JSON.stringify({ status: 'completed' }), { status: 200 }));

    const mockEnv: WorkerEnv = {
      AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          exportFullWorkspaceHistory: legacyExportSpy,
          fetch: vi.fn(async () => new Response('legacy agent')),
        })),
      },
      FINANCE_CHAT_AGENT: {
        idFromName: vi.fn((name: string) => ({ name }) as unknown as DurableObjectId),
        get: vi.fn(() => ({
          importLegacyHistory: financeImportSpyBlocked,
          fetch: financeFetchSpy,
        })),
      },
      API_ORIGIN: 'https://api.test.local',
      AGENT_CONNECTION_TOKEN_SECRET: SECRET,
      AGENT_AUTH_SERVICE_TOKEN: 'test-auth-service-token',
      AGENT_CONFIG_TOKEN: 'test-config-token',
    };

    const req = new Request(
      `https://agent.test.local/agents/workspace/${WORKSPACE_ID}/message`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-agent-connection-token': token,
          origin: 'https://pi-finance-pwa.walissonead.workers.dev',
        },
        body: JSON.stringify({ text: 'Olá assistente' }),
      },
    );

    const res = await worker.fetch(req, mockEnv);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('agent.history_migration_pending');
    expect(financeFetchSpy).not.toHaveBeenCalled();
  });

  it('(5) RED: FinanceChatAgent.importLegacyHistory fails safely with error if persistMessages is absent rather than mutating in-memory array', async () => {
    const persistedMessages: UIMessage[] = [];
    const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent & {
      messages: UIMessage[];
    };
    agent.messages = persistedMessages;
    (agent as unknown as { persistMessages: unknown }).persistMessages = undefined;

    const res = await agent.importLegacyHistory(sampleExport);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('missing_persist_callback');
    // Ensure memory messages array was not mutated as fallback
    expect(agent.messages).toHaveLength(0);
  });
});
