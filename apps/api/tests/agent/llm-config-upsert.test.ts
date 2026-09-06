import { describe, expect, it } from 'vitest';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-postgres.js';

const providerInput = (overrides: Record<string, unknown> = {}) => ({
  id: 'openai-api',
  kind: 'openai-api' as const,
  transport: 'direct' as const,
  authMode: 'api-key' as const,
  secretAlias: 'OPENAI_API_KEY' as const,
  enabled: true,
  eligibility: 'approved' as const,
  ...overrides,
});

const modelInput = (overrides: Record<string, unknown> = {}) => ({
  providerId: 'openai-api',
  modelId: 'gpt-4o',
  protocol: 'chat-completions' as const,
  privacyClass: 'training_prohibited' as const,
  enabled: true,
  ...overrides,
});

describe('Fase 1b-FIX item 1 — upsert preserves enabled on conflict (RED)', () => {
  it('upsertProvider over the active provider does not change enabled and does not 409', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const model = await store.upsertModel(modelInput());
    await store.setModelEnabled(model.id, true);
    const rt = await store.getRuntime();
    await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });

    const out = await store.upsertProvider(providerInput({ enabled: false }));
    expect(out.enabled).toBe(true);
    expect((await store.getProvider('openai-api'))?.enabled).toBe(true);
  });

  it('upsertProvider over the fallback provider does not change enabled', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    await store.setProviderEnabled('opencode-zen', true);
    const active = await store.upsertModel(modelInput());
    await store.setModelEnabled(active.id, true);
    const fb = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(fb.id, true);
    let rt = await store.getRuntime();
    rt = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: active.id,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: fb.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });

    const out = await store.upsertProvider({
      id: 'opencode-zen',
      kind: 'opencode-zen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY',
      enabled: false,
    });
    expect(out.enabled).toBe(true);
  });

  it('upsertModel over the active model does not change enabled', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    const model = await store.upsertModel(modelInput());
    await store.setModelEnabled(model.id, true);
    const rt = await store.getRuntime();
    await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });

    const out = await store.upsertModel(modelInput({ enabled: false }));
    expect(out.enabled).toBe(true);
    expect(out.id).toBe(model.id);
  });

  it('upsertModel over the fallback model does not change enabled', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.setProviderEnabled('openai-api', true);
    await store.setProviderEnabled('opencode-zen', true);
    const active = await store.upsertModel(modelInput());
    await store.setModelEnabled(active.id, true);
    const fb = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(fb.id, true);
    let rt = await store.getRuntime();
    await store.updateRuntime({
      providerId: 'openai-api',
      modelId: active.id,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: fb.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });

    const out = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: false,
    });
    expect(out.enabled).toBe(true);
  });

  it('new providers and models still default to disabled', async () => {
    const store = createInMemoryLlmConfigStore({ providers: [], models: [] });
    const p = await store.upsertProvider({
      id: 'deepseek',
      kind: 'deepseek',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'DEEPSEEK_API_KEY',
    });
    expect(p.enabled).toBe(false);
    const m = await store.upsertModel({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
    });
    expect(m.enabled).toBe(false);
  });
});
