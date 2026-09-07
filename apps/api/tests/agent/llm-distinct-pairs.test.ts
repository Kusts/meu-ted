import { describe, expect, it } from 'vitest';
import { modelRefSchema, activateSchema } from '@pi-finance/llm-contracts/schemas';
import { validateDistinctPairs } from '../../src/agent/llm-config.js';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';

describe('M-01: modelRef unificado + pares distintos', () => {
  it('modelRef aceita nome bare e composto provider:model', () => {
    expect(modelRefSchema.safeParse('gpt-4o-mini').success).toBe(true);
    expect(modelRefSchema.safeParse('openai-api:gpt-4o-mini').success).toBe(true);
    expect(modelRefSchema.safeParse('openrouter:meta-llama/llama-3-8b').success).toBe(true);
  });

  it('modelRef rejeita strings opacas/forma livre', () => {
    expect(modelRefSchema.safeParse('').success).toBe(false);
    expect(modelRefSchema.safeParse('foo bar!!!').success).toBe(false);
    expect(modelRefSchema.safeParse('a'.repeat(186)).success).toBe(false);
    expect(modelRefSchema.safeParse('../etc/passwd').success).toBe(false);
    expect(modelRefSchema.safeParse(':noname').success).toBe(false);
    expect(modelRefSchema.safeParse('UPPER:has space').success).toBe(false);
  });

  it('activateSchema herda a disciplina do modelRef', () => {
    expect(
      activateSchema.safeParse({ providerId: 'openai-api', modelId: 'junk ref !!', expectedVersion: 1 }).success,
    ).toBe(false);
    expect(
      activateSchema.safeParse({ providerId: 'openai-api', modelId: 'openai-api:gpt-4o-mini', expectedVersion: 1 })
        .success,
    ).toBe(true);
  });

  it('validateDistinctPairs rejeita fallback igual ao ativo (normalizado)', () => {
    expect(validateDistinctPairs('openai-api', 'm1', 'openai-api', 'm1')).toMatch(/differ|distinct|igual/i);
    // Alias legado conta como igual.
    expect(validateDistinctPairs('openai', 'm1', 'openai-api', 'm1')).toMatch(/differ|distinct|igual/i);
    expect(validateDistinctPairs('openai-api', 'm1', 'openai-api', 'm2')).toBeNull();
    expect(validateDistinctPairs('openai-api', 'm1', 'deepseek', 'm1')).toBeNull();
    expect(validateDistinctPairs('openai-api', 'm1', null, null)).toBeNull();
    expect(validateDistinctPairs(null, null, null, null)).toBeNull();
  });

  it('updateRuntime recusa fallback idêntico ao ativo (422 activation_blocked)', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.upsertProvider({
      id: 'openai-api', kind: 'openai-api', transport: 'direct', authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY', enabled: true, eligibility: 'approved',
    });
    const model = await store.upsertModel({
      providerId: 'openai-api', modelId: 'gpt-4o-mini', protocol: 'chat-completions',
      privacyClass: 'training_prohibited', enabled: true,
    });
    await store.setProviderEnabled('openai-api', true);
    await store.setModelEnabled(model.id, true);

    const v0 = await store.getRuntime();
    await store.updateRuntime({
      expectedVersion: v0.version,
      providerId: 'openai-api',
      modelId: model.id,
      fallbackProviderId: null,
      fallbackModelId: null,
    });

    const v1 = await store.getRuntime();
    await expect(
      store.updateRuntime({
        expectedVersion: v1.version,
        providerId: 'openai-api',
        modelId: model.id,
        fallbackProviderId: 'openai-api',
        fallbackModelId: model.id,
      }),
    ).rejects.toMatchObject({ code: 'agent.activation_blocked' });

    // Modelo distinto no mesmo provider é permitido.
    const other = await store.upsertModel({
      providerId: 'openai-api', modelId: 'gpt-4o', protocol: 'chat-completions',
      privacyClass: 'training_prohibited', enabled: true,
    });
    await store.setModelEnabled(other.id, true);
    const v2 = await store.getRuntime();
    await expect(
      store.updateRuntime({
        expectedVersion: v2.version,
        providerId: 'openai-api',
        modelId: model.id,
        fallbackProviderId: 'openai-api',
        fallbackModelId: other.id,
      }),
    ).resolves.toMatchObject({ fallbackModelId: other.id });
  });
});
