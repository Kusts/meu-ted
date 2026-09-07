import { describe, expect, it } from 'vitest';
import { KIND_PROTOCOL_COMPAT, KIND_SECRET_ALIASES, normalizeProviderId } from
'@pi-finance/llm-contracts';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';

const seedActivePair = async (store: ReturnType<typeof createInMemoryLlmConfigStore>) => {
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

const baseProviderInput = {
  id: 'openai-api',
  kind: 'openai-api' as const,
  transport: 'direct' as const,
  authMode: 'api-key' as const,
  secretAlias: 'OPENAI_API_KEY' as const,
};

describe('Fase 2 item 6 — upsert metadata guards on referenced items (RED)', () => {
  it('demoting eligibility of the active provider is rejected with 409', async () => {
    const store = createInMemoryLlmConfigStore();
    await seedActivePair(store);
    await expect(
      store.upsertProvider({ ...baseProviderInput, eligibility: 'candidate' }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_provider',
    });
    expect((await store.getProvider('openai-api'))?.eligibility).toBe('approved');
  });

  it('demoting eligibility of the fallback provider is rejected with 409', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime } = await seedActivePair(store);
    await store.setProviderEnabled('opencode-zen', true);
    const fb = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(fb.id, true);
    await store.updateRuntime({
      providerId: runtime.providerId,
      modelId: runtime.modelId,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: fb.id,
      expectedVersion: runtime.version,
      updatedBy: 'fix@test.com',
    });
    await expect(
      store.upsertProvider({
        id: 'opencode-zen',
        kind: 'opencode-zen',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'OPENCODE_ZEN_API_KEY',
        eligibility: 'experimental_blocked',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'fallback_provider',
    });
    expect((await store.getProvider('opencode-zen'))?.eligibility).toBe('approved');
  });

  it('changing protocol of the active model is rejected with 422', async () => {
    const store = createInMemoryLlmConfigStore();
    const { model } = await seedActivePair(store);
    await expect(
      store.upsertModel({
        providerId: 'openai-api',
        modelId: 'gpt-4o',
        protocol: 'responses',
        privacyClass: 'training_prohibited',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'agent.invalid_model' });
    expect((await store.getModel(model.id))?.protocol).toBe('chat-completions');
  });

  it('changing privacyClass of the fallback model is rejected with 422', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime } = await seedActivePair(store);
    await store.setProviderEnabled('opencode-zen', true);
    const fb = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(fb.id, true);
    await store.updateRuntime({
      providerId: runtime.providerId,
      modelId: runtime.modelId,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: fb.id,
      expectedVersion: runtime.version,
      updatedBy: 'fix@test.com',
    });
    await expect(
      store.upsertModel({
        providerId: 'opencode-zen',
        modelId: 'zen-1',
        protocol: 'chat-completions',
        privacyClass: 'training_allowed',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'agent.invalid_model' });
    expect((await store.getModel(fb.id))?.privacyClass).toBe('training_prohibited');
  });

  it('changing kind of the active provider to unsupported is rejected with 422', async () => {
    const store = createInMemoryLlmConfigStore();
    await seedActivePair(store);
    await expect(
      store.upsertProvider({
        ...baseProviderInput,
        kind: 'openai-codex-subscription',
        transport: 'private-broker',
        authMode: 'chatgpt-browser',
        secretAlias: null,
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'agent.kind_unsupported' });
    expect((await store.getProvider('openai-api'))?.kind).toBe('openai-api');
  });

  it('metadata changes on unreferenced items still apply', async () => {
    const store = createInMemoryLlmConfigStore();
    await seedActivePair(store);
    const out = await store.upsertProvider({
      id: 'opencode-zen',
      kind: 'opencode-zen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY',
      eligibility: 'experimental_blocked',
    });
    expect(out.eligibility).toBe('experimental_blocked');
    const m = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-9',
      protocol: 'responses',
      privacyClass: 'training_prohibited',
    });
    expect(m.protocol).toBe('responses');
  });
});

describe('Fase 3 item 2 — compat + identity guards on referenced models (RED)', () => {
  const seedAnthropicActivePair = async (
    store: ReturnType<typeof createInMemoryLlmConfigStore>,
  ) => {
    await store.upsertProvider({
      id: 'anthropic',
      kind: 'anthropic',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'ANTHROPIC_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    await store.setProviderEnabled('anthropic', true);
    const model = await store.upsertModel({
      providerId: 'anthropic',
      modelId: 'claude-x',
      protocol: 'messages',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(model.id, true);
    const rt = await store.getRuntime();
    const runtime = await store.updateRuntime({
      providerId: 'anthropic',
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: 'fase3@test.com',
    });
    return { model, runtime };
  };

  it('changing protocol of the active model to a kind-incompatible one is rejected with 422', async () => {
    const store = createInMemoryLlmConfigStore();
    const { model } = await seedAnthropicActivePair(store);
    await expect(
      store.upsertModel({
        providerId: 'anthropic',
        modelId: 'claude-x',
        protocol: 'chat-completions',
        privacyClass: 'training_prohibited',
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'agent.invalid_model',
      reason: 'model protocol chat-completions is not compatible with provider kind anthropic',
    });
    expect((await store.getModel(model.id))?.protocol).toBe('messages');
  });

  it('changing providerId/modelId identity of the active model is rejected with 409', async () => {
    const store = createInMemoryLlmConfigStore();
    const { model } = await seedAnthropicActivePair(store);
    await expect(
      store.upsertModel({
        id: model.id,
        providerId: 'anthropic',
        modelId: 'claude-y',
        protocol: 'messages',
        privacyClass: 'training_prohibited',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_model',
    });
    expect((await store.getModel(model.id))?.modelId).toBe('claude-x');
  });

  it('identity violation wins over compat violation (409 precedence, adversarial)', async () => {
    // Both wrong at once: the upsert targets a different identity AND an
    // incompatible protocol. Identity (conflict) must fire first — the
    // request is not an update of the referenced row at all.
    const store = createInMemoryLlmConfigStore();
    const { model } = await seedAnthropicActivePair(store);
    await expect(
      store.upsertModel({
        id: model.id,
        providerId: 'anthropic',
        modelId: 'claude-y',
        protocol: 'chat-completions',
        privacyClass: 'training_prohibited',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_model',
    });
    expect((await store.getModel(model.id))?.modelId).toBe('claude-x');
  });

  it('compatible protocol change on the active model still applies', async () => {
    const store = createInMemoryLlmConfigStore();
    await seedActivePair(store);
    // openai-api accepts responses: immutability fires (same pair), so use an
    // unreferenced-but-compatible provider/model to prove compat allows writes.
    const m = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o-mini',
      protocol: 'responses',
      privacyClass: 'training_prohibited',
    });
    expect(m.protocol).toBe('responses');
  });
});

describe('Fase 3-FIX R1 — provider kind switch revalidates the referenced pair', () => {
  it('audit repro 4.2: openai-api → anthropic with an active chat-completions model is rejected with 409', async () => {
    const store = createInMemoryLlmConfigStore();
    await seedActivePair(store);
    await expect(
      store.upsertProvider({
        id: 'openai-api',
        kind: 'anthropic',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'ANTHROPIC_API_KEY',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_provider',
    });
    expect((await store.getProvider('openai-api'))?.kind).toBe('openai-api');
  });

  it('a kind switch between compatible executable kinds still applies', async () => {
    const store = createInMemoryLlmConfigStore();
    await seedActivePair(store);
    const out = await store.upsertProvider({
      id: 'openai-api',
      kind: 'openai',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
    });
    // H-08: the legacy alias kind normalizes to canonical on write.
    expect(out.kind).toBe('openai-api');
  });

  it('a kind switch breaking the FALLBACK pair is rejected with 409', async () => {
    const store = createInMemoryLlmConfigStore();
    const { runtime } = await seedActivePair(store);
    await store.setProviderEnabled('opencode-zen', true);
    const fb = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-1',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(fb.id, true);
    await store.updateRuntime({
      providerId: runtime.providerId,
      modelId: runtime.modelId,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: fb.id,
      expectedVersion: runtime.version,
      updatedBy: 'fix@test.com',
    });
    await expect(
      store.upsertProvider({
        id: 'opencode-zen',
        kind: 'anthropic',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: 'ANTHROPIC_API_KEY',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'fallback_provider',
    });
    expect((await store.getProvider('opencode-zen'))?.kind).toBe('opencode-zen');
  });
});

describe('Fase 3-FIX R1 — per-kind matrix on referenced-model upserts', () => {
  const ALL_PROTOCOLS = ['chat-completions', 'responses', 'messages', 'google-generative-ai'] as const;

  // H-08: matrix runs over CANONICAL kinds — legacy aliases converge to
  // the canonical id on write, so alias rows carry no separate compat.
  const CANONICAL_MATRIX = Object.entries(KIND_PROTOCOL_COMPAT).map(([kind, protocols]) => [
    normalizeProviderId(kind),
    protocols,
  ] as const);
  const DEDUPED_MATRIX = [...new Map(CANONICAL_MATRIX.map(([kind, protocols]) => [kind, protocols])).entries()];

  it.each(DEDUPED_MATRIX)(
    'incompatible-protocol upsert on the referenced model is rejected for kind %s',
    async (kind, protocols) => {
      const bad = ALL_PROTOCOLS.find((p) => !(protocols as readonly string[]).includes(p))!;
      const good = (protocols as readonly string[])[0]!;
      const alias = (KIND_SECRET_ALIASES as Record<string, readonly string[]>)[kind]![0]!;
      const store = createInMemoryLlmConfigStore();
      await store.upsertProvider({
        id: kind,
        kind: kind as 'openai-api',
        transport: 'direct',
        authMode: 'api-key',
        secretAlias: alias as 'OPENAI_API_KEY',
        enabled: true,
        eligibility: 'approved',
      });
      await store.setProviderEnabled(kind, true);
      const model = await store.upsertModel({
        providerId: kind,
        modelId: 'm',
        protocol: good as 'chat-completions',
        privacyClass: 'training_prohibited',
        enabled: true,
      });
      await store.setModelEnabled(model.id, true);
      const rt = await store.getRuntime();
      await store.updateRuntime({
        providerId: kind,
        modelId: model.id,
        expectedVersion: rt.version,
        updatedBy: 'matrix@test.com',
      });
      await expect(
        store.upsertModel({
          providerId: kind,
          modelId: 'm',
          protocol: bad as 'chat-completions',
          privacyClass: 'training_prohibited',
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: 'agent.invalid_model',
        reason: `model protocol ${bad} is not compatible with provider kind ${kind}`,
      });
      expect((await store.getModel(model.id))?.protocol).toBe(good);
    },
  );
});
