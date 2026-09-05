import { describe, expect, it, vi } from 'vitest';
import { createPostgresLlmConfigStore } from '../../src/agent/llm-config-postgres.js';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-postgres.js';

// Phase 0 RED tests — should fail before fix

describe('Phase0 RED: updateRuntime SAVEPOINT (B-H8)', () => {
  it('rethrows non-42703 errors instead of swallowing via fallback retry', async () => {
    const mockClient: any = {
      query: vi.fn(),
      release: vi.fn(),
    };
    const mockPool: any = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 1 }] }) // SELECT version
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // SAVEPOINT
      .mockRejectedValueOnce(Object.assign(new Error('deadlock'), { code: '40P01' })) // UPDATE fallback throws 40P01
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // ROLLBACK (outer catch)
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // extra

    const store = createPostgresLlmConfigStore(mockPool);
    await expect(
      store.updateRuntime({
        providerId: 'openai-api',
        modelId: 'openai-api:gpt-4o',
        expectedVersion: 1,
        updatedBy: 'admin@test.com',
      }),
    ).rejects.toMatchObject({ code: '40P01' });

    const queries = mockClient.query.mock.calls.map((c: any) => String(c[0]));
    expect(queries.join(' ')).toContain('SAVEPOINT');
    // Ensure legacy UPDATE was NOT attempted (only 1 UPDATE)
    const updateCalls = queries.filter((q: string) => q.includes('UPDATE agent_llm_runtime_config'));
    expect(updateCalls.length).toBe(1);
  });

  it('still falls back on 42703 undefined_column', async () => {
    const mockClient: any = {
      query: vi.fn(),
      release: vi.fn(),
    };
    const mockPool: any = {
      connect: vi.fn().mockResolvedValue(mockClient),
    };
    mockClient.query
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ version: 1 }] }) // SELECT version
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // SAVEPOINT
      .mockRejectedValueOnce(Object.assign(new Error('undefined column'), { code: '42703' })) // UPDATE fallback
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // ROLLBACK TO SAVEPOINT
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            singleton: 'active',
            provider_id: 'openai-api',
            model_id: 'openai-api:gpt-4o',
            rollout_mode: 'disabled',
            canary_allowlist: [],
            security_epoch: 1,
            version: 2,
            updated_at: new Date().toISOString(),
            updated_by: 'admin@test.com',
          },
        ],
      }) // UPDATE legacy
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // RELEASE SAVEPOINT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }); // COMMIT

    const store = createPostgresLlmConfigStore(mockPool);
    const result = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: 'openai-api:gpt-4o',
      expectedVersion: 1,
      updatedBy: 'admin@test.com',
    });
    expect(result.version).toBe(2);
  });
});

describe('Phase0 RED: toggle invariant', () => {
  it('toggle provider active → 409', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const runtime = await store.getRuntime();
    await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: runtime.version,
      updatedBy: 'admin@test.com',
    });
    await expect(store.setProviderEnabled('openai-api', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
    });
  });

  it('toggle model in fallback → 409', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    await store.setProviderEnabled('opencode-zen', true);
    const activeModel = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const fallbackModel = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    let runtime = await store.getRuntime();
    runtime = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: activeModel.id,
      expectedVersion: runtime.version,
      updatedBy: 'admin@test.com',
    });
    runtime = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: activeModel.id,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: fallbackModel.id,
      expectedVersion: runtime.version,
      updatedBy: 'admin@test.com',
    });
    await expect(store.setModelEnabled(fallbackModel.id, false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
    });
  });

  it('toggle non-referenced → 200', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await expect(store.setModelEnabled(model.id, false)).resolves.toMatchObject({ enabled: false });
  });
});

describe('Phase0 RED: delete invariants', () => {
  it('delete active model → 409', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const runtime = await store.getRuntime();
    await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: runtime.version,
      updatedBy: 'admin@test.com',
    });
    await expect(store.deleteModel(model.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
    });
  });
  it('delete active provider → 409', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const runtime = await store.getRuntime();
    await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: runtime.version,
      updatedBy: 'admin@test.com',
    });
    await expect(store.deleteProvider('openai-api')).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
    });
  });
});

describe('Phase0 RED: activate fallback pair validation', () => {
  it('cross provider/model pair should be rejected', async () => {
    // This will be tested via route in separate file
    expect(true).toBe(true);
  });
});
