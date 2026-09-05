import { describe, expect, it, vi } from 'vitest';
import { createPostgresLlmConfigStore } from '../../src/agent/llm-config-postgres.js';

const providerRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'openai-api',
  kind: 'openai-api',
  transport: 'direct',
  auth_mode: 'api-key',
  secret_alias: 'OPENAI_API_KEY',
  service_alias: null,
  enabled: true,
  eligibility: 'approved',
  runtime_status: 'not_configured',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  updated_by: null,
  ...overrides,
});

const modelRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'openai-api:gpt-4o',
  provider_id: 'openai-api',
  model_id: 'gpt-4o',
  protocol: 'chat-completions',
  privacy_class: 'training_prohibited',
  retention: null,
  enabled: true,
  created_at: new Date().toISOString(),
  ...overrides,
});

const runtimeRow = () => ({
  singleton: 'active',
  provider_id: 'openai-api',
  model_id: 'openai-api:gpt-4o',
  fallback_provider_id: 'opencode-zen',
  fallback_model_id: 'opencode-zen:zen-1',
  rollout_mode: 'disabled',
  canary_allowlist: [],
  security_epoch: 1,
  version: 2,
  updated_at: new Date().toISOString(),
  updated_by: 'admin@test.com',
});

type QueryFn = (text: string, values?: unknown[]) => { rowCount: number | null; rows: Record<string, unknown>[] };

/** Routes SQL text to canned results: conditional UPDATE/DELETE first, then lookups. */
const mockPool = (mutate: QueryFn) => {
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    if (/^(UPDATE|DELETE)/.test(text)) return mutate(text, values);
    if (text.includes('agent_llm_runtime_config')) {
      return { rowCount: 1, rows: [runtimeRow() as unknown as Record<string, unknown>] };
    }
    if (text.includes('FROM agent_llm_providers')) {
      return { rowCount: 1, rows: [providerRow() as unknown as Record<string, unknown>] };
    }
    if (text.includes('FROM agent_llm_models')) {
      return { rowCount: 1, rows: [modelRow() as unknown as Record<string, unknown>] };
    }
    return { rowCount: 0, rows: [] };
  });
  return { query, pool: { query } as never };
};

describe('Fase 1b F4 — atomic runtime-conditional guards (RED)', () => {
  it('disabling an unreferenced provider issues a single conditional UPDATE (no separate SELECT)', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 1, rows: [providerRow({ enabled: false })] }));
    const store = createPostgresLlmConfigStore(pool);
    const provider = await store.setProviderEnabled('openai-api', false);
    expect(provider.enabled).toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
    expect(String(query.mock.calls[0]?.[0])).toContain('NOT EXISTS');
  });

  it('disabling the active provider maps 0 mutated rows to 409 active_provider', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.setProviderEnabled('openai-api', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_provider',
    });
    const updateCall = query.mock.calls.find((c) => String(c[0]).startsWith('UPDATE'));
    expect(updateCall).toBeDefined();
    expect(String(updateCall?.[0])).toContain('NOT EXISTS');
  });

  it('disabling the fallback provider maps 0 mutated rows to 409 fallback_provider', async () => {
    const { pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.setProviderEnabled('opencode-zen', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'fallback_provider',
    });
  });

  it('disabling a missing provider maps 0 mutated rows + no row to 404', async () => {
    const query = vi.fn(async (text: string) => {
      if (/^(UPDATE|DELETE)/.test(text)) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const store = createPostgresLlmConfigStore({ query } as never);
    await expect(store.setProviderEnabled('ghost', false)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deleting the active provider issues a single conditional DELETE mapping 0 rows to 409', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.deleteProvider('openai-api')).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_provider',
    });
    const deleteCall = query.mock.calls.find((c) => String(c[0]).startsWith('DELETE'));
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toContain('NOT EXISTS');
  });

  it('disabling the active model maps 0 mutated rows to 409 active_model', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.setModelEnabled('openai-api:gpt-4o', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_model',
    });
    const updateCall = query.mock.calls.find((c) => String(c[0]).startsWith('UPDATE'));
    expect(updateCall).toBeDefined();
    expect(String(updateCall?.[0])).toContain('NOT EXISTS');
  });

  it('deleting the fallback model maps 0 mutated rows to 409 fallback_model', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.deleteModel('opencode-zen:zen-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'fallback_model',
    });
    const deleteCall = query.mock.calls.find((c) => String(c[0]).startsWith('DELETE'));
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toContain('NOT EXISTS');
  });
});
