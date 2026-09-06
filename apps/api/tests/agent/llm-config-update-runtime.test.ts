import { describe, expect, it } from 'vitest';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';

const seedActive = async (store: ReturnType<typeof createInMemoryLlmConfigStore>) => {
  await store.setProviderEnabled('openai-api', true);
  const model = await store.upsertModel({
    providerId: 'openai-api',
    modelId: 'gpt-4o',
    protocol: 'chat-completions',
    privacyClass: 'training_prohibited',
    enabled: true,
  });
  await store.setModelEnabled(model.id, true);
  const rt = await store.getRuntime();
  const updated = await store.updateRuntime({
    providerId: 'openai-api',
    modelId: model.id,
    expectedVersion: rt.version,
    updatedBy: 'fix@test.com',
  });
  return { model, runtime: updated };
};

describe('Fase 1b-FIX item 6 — updateRuntime revalidates pairs under lock (RED)', () => {
  it('rejects activation of a disabled target without mutating runtime', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime: before } = await seedActive(store);
    await store.setProviderEnabled('opencode-zen', true);
    const target = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(target.id, true);
    // Concurrent toggle wins first: target disabled, version untouched.
    await store.setProviderEnabled('opencode-zen', false);

    await expect(
      store.updateRuntime({
        providerId: 'opencode-zen',
        modelId: target.id,
        expectedVersion: before.version,
        updatedBy: 'fix@test.com',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'agent.activation_blocked' });
    const after = await store.getRuntime();
    expect(after).toMatchObject({ providerId: before.providerId, modelId: before.modelId, version: before.version });
  });

  it('rejects a disabled fallback pair without mutating runtime', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime: before } = await seedActive(store);
    await store.setProviderEnabled('opencode-zen', true);
    const fb = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(fb.id, true);
    await store.setModelEnabled(fb.id, false);

    await expect(
      store.updateRuntime({
        providerId: before.providerId,
        modelId: before.modelId,
        fallbackProviderId: 'opencode-zen',
        fallbackModelId: fb.id,
        expectedVersion: before.version,
        updatedBy: 'fix@test.com',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'agent.activation_blocked' });
    const after = await store.getRuntime();
    expect(after.version).toBe(before.version);
    expect(after.fallbackModelId ?? null).toBeNull();
  });

  it('rejects a cross pair without mutating runtime', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime: before } = await seedActive(store);
    await store.setProviderEnabled('opencode-zen', true);
    const other = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(other.id, true);

    await expect(
      store.updateRuntime({
        providerId: 'openai-api',
        modelId: other.id,
        expectedVersion: before.version,
        updatedBy: 'fix@test.com',
      }),
    ).rejects.toMatchObject({ code: 'agent.activation_blocked', reason: 'model does not belong to provider' });
    expect((await store.getRuntime()).version).toBe(before.version);
  });

  it('rejects an unsupported-kind target without mutating runtime', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime: before } = await seedActive(store);
    await store.upsertProvider({
      id: 'openai-codex-subscription',
      kind: 'openai-codex-subscription',
      transport: 'private-broker',
      authMode: 'chatgpt-browser',
      secretAlias: null,
      eligibility: 'approved',
    });
    await store.setProviderEnabled('openai-codex-subscription', true);
    const codex = await store.upsertModel({
      providerId: 'openai-codex-subscription',
      modelId: 'codex-mini',
      protocol: 'responses',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(codex.id, true);

    await expect(
      store.updateRuntime({
        providerId: 'openai-codex-subscription',
        modelId: codex.id,
        expectedVersion: before.version,
        updatedBy: 'fix@test.com',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'agent.activation_blocked' });
    expect((await store.getRuntime()).version).toBe(before.version);
  });

  it('still applies rollout-only updates on a valid state', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime: before } = await seedActive(store);
    const updated = await store.updateRuntime({
      providerId: before.providerId,
      modelId: before.modelId,
      rolloutMode: 'canary',
      canaryAllowlist: ['ws-1'],
      expectedVersion: before.version,
      updatedBy: 'fix@test.com',
    });
    expect(updated.version).toBe(before.version + 1);
    expect(updated.rolloutMode).toBe('canary');
  });
});
