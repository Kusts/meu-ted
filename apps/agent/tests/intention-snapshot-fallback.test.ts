import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FinanceChatAgent,
  ensureIntentionSnapshotColumns,
  type IntentionSnapshotRow,
} from '../src/finance-chat-agent.js';

type SqlCall = { query: string; bindings: unknown[] };

const makeSql = (opts: { pragmaColumns: string[]; selectRows: unknown[] }) => {
  const calls: SqlCall[] = [];
  const exec = <T>(query: string, ...bindings: unknown[]): Iterable<T> => {
    calls.push({ query, bindings });
    if (query.startsWith('PRAGMA')) {
      return opts.pragmaColumns.map((name) => ({ name })) as unknown as Iterable<T>;
    }
    if (query.startsWith('SELECT')) {
      return opts.selectRows as unknown as Iterable<T>;
    }
    return [] as unknown as Iterable<T>;
  };
  return { exec, calls };
};

const makeAgent = (sql: { exec<T>(query: string, ...bindings: unknown[]): Iterable<T> }) => {
  const agent = Object.create(FinanceChatAgent.prototype) as FinanceChatAgent;
  Object.defineProperty(agent, 'state', { value: { storage: { sql } }, writable: true, configurable: true });
  Object.defineProperty(agent, 'env', {
    value: { API_ORIGIN: 'https://api.test.local', AGENT_CONFIG_TOKEN: 'config-test-token' },
    writable: true,
    configurable: true,
  });
  return agent;
};

const callResolve = (agent: FinanceChatAgent, intentionId: string) =>
  (
    agent as unknown as {
      resolveIntentionSnapshot(id: string): Promise<IntentionSnapshotRow | null>;
    }
  ).resolveIntentionSnapshot(intentionId);

const snapshotResponse = (fallbackProviderId: string | null, fallbackModelId: string | null) =>
  new Response(
    JSON.stringify({
      runtime: {
        singleton: 'active',
        version: 2,
        securityEpoch: 1,
        activeProviderId: 'openai-api',
        activeModelId: 'openai-api:gpt-4o',
        activeProtocol: 'chat-completions',
        activeRolloutPercentage: 100,
        activeRolloutMode: 'all',
        canaryAllowlist: [],
        fallbackProviderId,
        fallbackModelId,
        updatedBy: 'admin@test.com',
      },
      activeProvider: { id: 'openai-api' },
      activeModel: { id: 'openai-api:gpt-4o' },
      fallbackProvider: null,
      fallbackModel: null,
      activeDisabled: false,
      fallbackDisabled: false,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

describe('Intention snapshot fallback persistence (Fase 1b F3 RED)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('migrates a legacy table by adding only the missing fallback columns', () => {
    const { exec, calls } = makeSql({
      pragmaColumns: [
        'intention_id',
        'version',
        'provider_id',
        'model_id',
        'protocol',
        'rollout_percentage',
        'security_epoch',
        'fallback_provider_id',
        'created_at',
      ],
      selectRows: [],
    });
    ensureIntentionSnapshotColumns({ exec });
    const alters = calls.filter((c) => c.query.startsWith('ALTER TABLE'));
    expect(alters).toHaveLength(1);
    expect(alters[0]?.query).toContain('fallback_model_id');
  });

  it('issues no ALTER when both fallback columns already exist', () => {
    const { exec, calls } = makeSql({
      pragmaColumns: ['intention_id', 'fallback_provider_id', 'fallback_model_id'],
      selectRows: [],
    });
    ensureIntentionSnapshotColumns({ exec });
    expect(calls.filter((c) => c.query.startsWith('ALTER TABLE'))).toHaveLength(0);
  });

  it('persists fallback ids in the INSERT on first resolution', async () => {
    const { exec, calls } = makeSql({ pragmaColumns: [], selectRows: [] });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      snapshotResponse('opencode-zen', 'opencode-zen:zen-1'),
    );
    const snapshot = await callResolve(makeAgent({ exec }), 'intent-fb-1');
    expect(snapshot?.fallback_provider_id).toBe('opencode-zen');
    expect(snapshot?.fallback_model_id).toBe('opencode-zen:zen-1');
    const insert = calls.find((c) => c.query.startsWith('INSERT INTO intention_snapshots'));
    expect(insert).toBeDefined();
    expect(insert?.query).toContain('fallback_provider_id');
    expect(insert?.query).toContain('fallback_model_id');
    expect(insert?.bindings).toContain('opencode-zen');
    expect(insert?.bindings).toContain('opencode-zen:zen-1');
  });

  it('recovers fallback ids from a stored row on later resolutions', async () => {
    const stored = {
      intention_id: 'intent-fb-1',
      version: 2,
      provider_id: 'openai-api',
      model_id: 'openai-api:gpt-4o',
      protocol: 'chat-completions',
      rollout_percentage: 100,
      security_epoch: 1,
      fallback_provider_id: 'opencode-zen',
      fallback_model_id: 'opencode-zen:zen-1',
      created_at: '2026-09-05T00:00:00.000Z',
    };
    const { exec } = makeSql({ pragmaColumns: [], selectRows: [stored] });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const snapshot = await callResolve(makeAgent({ exec }), 'intent-fb-1');
    expect(snapshot?.fallback_provider_id).toBe('opencode-zen');
    expect(snapshot?.fallback_model_id).toBe('opencode-zen:zen-1');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a legacy row without fallback keys to nulls instead of crashing', async () => {
    const legacy = {
      intention_id: 'intent-legacy',
      version: 1,
      provider_id: 'openai-api',
      model_id: 'openai-api:gpt-4o',
      protocol: 'chat-completions',
      rollout_percentage: 100,
      security_epoch: 1,
      created_at: '2026-09-05T00:00:00.000Z',
    };
    const { exec } = makeSql({ pragmaColumns: [], selectRows: [legacy] });
    const snapshot = await callResolve(makeAgent({ exec }), 'intent-legacy');
    expect(snapshot?.fallback_provider_id).toBeNull();
    expect(snapshot?.fallback_model_id).toBeNull();
  });
});
