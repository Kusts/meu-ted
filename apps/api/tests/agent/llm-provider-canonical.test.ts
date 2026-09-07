import { describe, expect, it } from 'vitest';
import { normalizeProviderId, getCatalogEntry } from '@pi-finance/llm-contracts/types';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';

describe('H-08: ID canônico openai-api (round-trip)', () => {
  it('normalizeProviderId converge o alias legado para o canônico', () => {
    expect(normalizeProviderId('openai')).toBe('openai-api');
    expect(normalizeProviderId('openai-api')).toBe('openai-api');
    expect(normalizeProviderId('deepseek')).toBe('deepseek');
  });

  it('catálogo resolve o canônico com mesma origem/segredo do alias', () => {
    const canonical = getCatalogEntry('openai-api');
    const legacy = getCatalogEntry('openai');
    expect(canonical).toMatchObject({
      baseUrl: 'https://api.openai.com/v1',
      modelsPath: '/models',
      secretAlias: 'OPENAI_API_KEY',
    });
    expect(legacy?.baseUrl).toBe(canonical?.baseUrl);
    expect(legacy?.secretAlias).toBe(canonical?.secretAlias);
    expect(legacy?.transport).toBe(canonical?.transport);
  });

  it('upsert com id legado persiste canônico (sem duplicar provider)', async () => {
    const store = createInMemoryLlmConfigStore();
    const saved = await store.upsertProvider({
      id: 'openai',
      kind: 'openai',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
    });
    expect(saved.id).toBe('openai-api');
    expect(saved.kind).toBe('openai-api');

    const providers = await store.listProviders();
    expect(providers.filter((p) => p.secretAlias === 'OPENAI_API_KEY').map((p) => p.id)).toEqual([
      'openai-api',
    ]);

    // Leitura pelo alias legado resolve o canônico.
    await expect(store.getProvider('openai')).resolves.toMatchObject({ id: 'openai-api' });
    await expect(store.getProvider('openai-api')).resolves.toMatchObject({ id: 'openai-api' });
  });

  it('ativação com id legado persiste o par canônico no runtime', async () => {
    const store = createInMemoryLlmConfigStore();
    await store.upsertProvider({
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
    });
    await store.setProviderEnabled('openai-api', true);
    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o-mini',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setModelEnabled(model.id, true);

    const before = await store.getRuntime();
    const runtime = await store.updateRuntime({
      expectedVersion: before.version,
      providerId: 'openai',
      modelId: model.id,
    });
    expect(runtime.providerId).toBe('openai-api');
  });
});
