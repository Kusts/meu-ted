import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryLlmConfigStore } from '../../src/agent/llm-config-memory.js';
import {
  __resetCredentialVaultForTests,
  listRemoteModels,
  testCredential,
} from '../../src/agent/llm-credentials.js';

const TEST_KEY = 'sk-test-h06-redirect-guard-key';

describe('H-06: API model listing bloqueia redirect (sem vazar Authorization)', () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = TEST_KEY;
    __resetCredentialVaultForTests();
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
    __resetCredentialVaultForTests();
    vi.restoreAllMocks();
  });

  const seedOpenAi = async () => {
    const store = createInMemoryLlmConfigStore();
    await store.upsertProvider({
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      eligibility: 'approved',
    });
    await store.setProviderEnabled('openai-api', true);
    return store;
  };

  it('listRemoteModels rejeita 302 cross-origin sem seguir nem cachear', async () => {
    const store = await seedOpenAi();
    const seenUrls: string[] = [];
    const redirectFetch = (async (url: unknown) => {
      seenUrls.push(String(url));
      return new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example.test/steal' },
      });
    }) as unknown as typeof fetch;

    await expect(listRemoteModels(store, 'openai-api', { fetchImpl: redirectFetch })).rejects.toMatchObject({
      code: 'redirect_rejected',
    });
    // Só o catálogo allowlisted foi tocado — nenhum follow para o destino.
    expect(seenUrls).toEqual(['https://api.openai.com/v1/models']);

    // Nada foi cacheado: com upstream saudável a listagem funciona.
    const okFetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini', owned_by: 'openai-api' }] }), { status: 200 })) as unknown as typeof fetch;
    const listed = await listRemoteModels(store, 'openai-api', { fetchImpl: okFetch });
    expect(listed.cached).toBe(false);
    expect(listed.models).toEqual([{ id: 'gpt-4o-mini', ownedBy: 'openai-api' }]);
  });

  it('testCredential com 302 retorna falha explícita sem vazar a key', async () => {
    const store = await seedOpenAi();
    const redirectFetch = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example.test/steal' },
      })) as unknown as typeof fetch;

    const result = await testCredential(store, 'openai-api', { fetchImpl: redirectFetch });
    expect(result.ready).toBe(false);
    expect(result.code).toBe('redirect_rejected');
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  it('caminho feliz 200 continua funcionando através do guard', async () => {
    const store = await seedOpenAi();
    const okFetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }), { status: 200 })) as unknown as typeof fetch;
    const listed = await listRemoteModels(store, 'openai-api', { fetchImpl: okFetch });
    expect(listed.models).toEqual([{ id: 'gpt-4o-mini' }]);
  });
});
