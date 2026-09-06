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

/** Routes SQL text to canned results; every store call flows through connect(). */
const mockPool = (mutate: QueryFn) => {
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    const t = text.trim();
    if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK' || t.startsWith('SAVEPOINT') || t.startsWith('RELEASE')) {
      return { rowCount: null, rows: [] };
    }
    if (/^(UPDATE|DELETE)/.test(t)) return mutate(text, values);
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
  const client = { query, release: vi.fn() };
  return { query, pool: { query, connect: async () => client } as never };
};

const statements = (query: ReturnType<typeof vi.fn>) =>
  query.mock.calls.map((c) => String(c[0]).trim());

describe('Fase 1b-FIX F4/F6 — locked runtime-conditional guards (RED)', () => {
  it('disabling an unreferenced provider locks runtime first, then writes, then commits', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 1, rows: [providerRow({ enabled: false })] }));
    const store = createPostgresLlmConfigStore(pool);
    const provider = await store.setProviderEnabled('opencode-go', false);
    expect(provider.enabled).toBe(false);
    const seq = statements(query);
    expect(seq[0]).toBe('BEGIN');
    expect(seq[1]).toMatch(/FROM agent_llm_runtime_config.*FOR UPDATE/);
    expect(seq).toContainEqual(expect.stringMatching(/^UPDATE agent_llm_providers/));
    expect(seq[seq.length - 1]).toBe('COMMIT');
  });

  it('disabling the active provider never issues the UPDATE and maps to 409 active_provider', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.setProviderEnabled('openai-api', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_provider',
    });
    const seq = statements(query);
    expect(seq).toContainEqual(expect.stringMatching(/FOR UPDATE/));
    expect(seq.some((s) => s.startsWith('UPDATE'))).toBe(false);
    expect(seq).toContain('ROLLBACK');
  });

  it('disabling the fallback provider maps to 409 fallback_provider', async () => {
    const { pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.setProviderEnabled('opencode-zen', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'fallback_provider',
    });
  });

  it('disabling a missing provider maps to 404', async () => {
    const query = vi.fn(async (text: string) => {
      const t = text.trim();
      if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') return { rowCount: null, rows: [] };
      if (/^UPDATE/.test(t)) return { rowCount: 0, rows: [] };
      return { rowCount: 0, rows: [] };
    });
    const client = { query, release: vi.fn() };
    const store = createPostgresLlmConfigStore({ query, connect: async () => client } as never);
    await expect(store.setProviderEnabled('ghost', false)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('deleting the active provider never issues the DELETE and maps to 409', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.deleteProvider('openai-api')).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_provider',
    });
    const seq = statements(query);
    expect(seq.some((s) => s.startsWith('DELETE'))).toBe(false);
    expect(seq).toContain('ROLLBACK');
  });

  it('disabling the active model maps to 409 active_model without writing', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.setModelEnabled('openai-api:gpt-4o', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_model',
    });
    expect(statements(query).some((s) => s.startsWith('UPDATE'))).toBe(false);
  });

  it('deleting the fallback model maps to 409 fallback_model without writing', async () => {
    const { query, pool } = mockPool(() => ({ rowCount: 0, rows: [] }));
    const store = createPostgresLlmConfigStore(pool);
    await expect(store.deleteModel('opencode-zen:zen-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'fallback_model',
    });
    expect(statements(query).some((s) => s.startsWith('DELETE'))).toBe(false);
  });
});
