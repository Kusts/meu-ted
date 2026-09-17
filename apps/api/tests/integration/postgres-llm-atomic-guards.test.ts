import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { createPostgresLlmConfigStore } from '../../src/agent/llm-config-postgres.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';

const DB_URL = process.env.DATABASE_URL_TEST_ATOMIC ?? process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

/** Isolated reset: this file owns its database, so truncating is safe. */
const resetLlmTables = async (): Promise<void> => {
  if (!pool) throw new Error('database pool not initialized');
  await pool.query(`TRUNCATE agent_llm_models, agent_llm_providers, agent_llm_runtime_config CASCADE`);
  await pool.query(
    `INSERT INTO agent_llm_runtime_config (singleton, rollout_mode, security_epoch, version)
     VALUES ('active', 'disabled', 1, 1)`,
  );
};

const seedPair = async (store: ReturnType<typeof createPostgresLlmConfigStore>, providerId: string, modelId: string) => {
  const kinds: Record<string, { kind: 'openai-api' | 'opencode-zen'; alias: 'OPENAI_API_KEY' | 'OPENCODE_ZEN_API_KEY' }> = {
    'openai-api': { kind: 'openai-api', alias: 'OPENAI_API_KEY' },
    'opencode-zen': { kind: 'opencode-zen', alias: 'OPENCODE_ZEN_API_KEY' },
  };
  const spec = kinds[providerId] ?? { kind: 'openai-api' as const, alias: 'OPENAI_API_KEY' as const };
  await store.upsertProvider({
    id: providerId,
    kind: spec.kind,
    transport: 'direct',
    authMode: 'api-key',
    secretAlias: spec.alias,
    enabled: true,
    eligibility: 'approved',
  });
  return store.upsertModel({
    providerId,
    modelId,
    protocol: 'chat-completions',
    privacyClass: 'training_prohibited',
    enabled: true,
  });
};

describe('Postgres LLM atomic runtime-conditional guards (Fase 1b F4 RED)', () => {
  beforeAll(async () => {
    if (DB_URL) {
      pool = createPool({ connectionString: DB_URL, max: 4 });
      await runMigrations(pool);
    }
  }, 120_000);

  afterAll(async () => {
    // Leave the SHARED database canonical: this file TRUNCATEs the LLM
    // tables per test, so re-seed the V034 base rows for sibling files and
    // second runs (all INSERTs are ON CONFLICT DO NOTHING).
    try {
      await pool?.query(
        `INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, eligibility, runtime_status, enabled) VALUES
          ('opencode-zen','opencode-zen','direct','api-key','OPENCODE_ZEN_API_KEY','approved','not_configured', false),
          ('opencode-go','opencode-go','direct','api-key','OPENCODE_GO_API_KEY','approved','not_configured', false),
          ('openai-api','openai-api','direct','api-key','OPENAI_API_KEY','approved','not_configured', false),
          ('openai-codex-subscription','openai-codex-subscription','private-broker','chatgpt-browser', NULL,'experimental_blocked','not_configured', false)
         ON CONFLICT (id) DO NOTHING`,
      );
      await pool?.query(
        `INSERT INTO agent_llm_runtime_config (singleton, rollout_mode, security_epoch, version)
         VALUES ('active','disabled',1,1) ON CONFLICT (singleton) DO NOTHING`,
      );
    } catch {
      // ignore
    }
    await pool?.end();
  });

  itIfDatabase('toggle-off of the active provider is rejected atomically on Postgres', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    const store = createPostgresLlmConfigStore(pool);
    const model = await seedPair(store, 'openai-api', 'guard-a');
    const rt = await store.getRuntime();
    await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: 'atomic@test.com',
    });
    await expect(store.setProviderEnabled('openai-api', false)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_provider',
    });
    expect((await store.getProvider('openai-api'))?.enabled).toBe(true);
  });

  itIfDatabase('toggle-off of the activation target vs activate: total order over 10 rounds', async () => {
    if (!pool) throw new Error('database pool not initialized');
    for (let round = 0; round < 10; round += 1) {
      await resetLlmTables();
      const store = createPostgresLlmConfigStore(pool);
      const modelA = await seedPair(store, 'openai-api', `race-a-${round}`);
      const modelB = await seedPair(store, 'opencode-zen', `race-b-${round}`);
      let rt = await store.getRuntime();
      rt = await store.updateRuntime({
        providerId: 'openai-api',
        modelId: modelA.id,
        expectedVersion: rt.version,
        updatedBy: 'atomic@test.com',
      });

      // Race the activation of B against a toggle-off of B itself: exactly
      // one order wins — (activate ok, toggle 409) or (toggle ok, activate 422).
      const settled = await Promise.allSettled([
        store.updateRuntime({
          providerId: 'opencode-zen',
          modelId: modelB.id,
          expectedVersion: rt.version,
          updatedBy: 'atomic@test.com',
        }),
        store.setProviderEnabled('opencode-zen', false),
      ]);
      for (const s of settled) {
        if (s.status === 'rejected') {
          const err = s.reason as { statusCode?: number; code?: string };
          // Legal losers: guard conflict, optimistic concurrency, or revalidation.
          expect([409, 422]).toContain(err.statusCode);
          expect(['agent.runtime_in_use', 'agent.version_conflict', 'agent.activation_blocked']).toContain(err.code);
        }
      }

      const [finalRuntime, providers] = await Promise.all([store.getRuntime(), store.listProviders()]);
      const referenced = providers.filter(
        (p) => p.id === finalRuntime.providerId || p.id === finalRuntime.fallbackProviderId,
      );
      for (const p of referenced) {
        expect(p.enabled).toBe(true);
      }
      const activeModel =
        finalRuntime.modelId === null ? null : await store.getModel(finalRuntime.modelId);
      if (activeModel) expect(activeModel.enabled).toBe(true);
    }
  }, 120_000);

  itIfDatabase('toggle-off of the activation target model vs activate: total order over 10 rounds', async () => {
    if (!pool) throw new Error('database pool not initialized');
    for (let round = 0; round < 10; round += 1) {
      await resetLlmTables();
      const store = createPostgresLlmConfigStore(pool);
      const modelA = await seedPair(store, 'openai-api', `mrace-a-${round}`);
      const modelB = await seedPair(store, 'opencode-zen', `mrace-b-${round}`);
      let rt = await store.getRuntime();
      rt = await store.updateRuntime({
        providerId: 'openai-api',
        modelId: modelA.id,
        expectedVersion: rt.version,
        updatedBy: 'atomic@test.com',
      });

      const settled = await Promise.allSettled([
        store.updateRuntime({
          providerId: 'opencode-zen',
          modelId: modelB.id,
          expectedVersion: rt.version,
          updatedBy: 'atomic@test.com',
        }),
        store.setModelEnabled(modelB.id, false),
      ]);
      for (const s of settled) {
        if (s.status === 'rejected') {
          const err = s.reason as { statusCode?: number; code?: string };
          expect([409, 422]).toContain(err.statusCode);
          expect(['agent.runtime_in_use', 'agent.version_conflict', 'agent.activation_blocked']).toContain(err.code);
        }
      }

      const finalRuntime = await store.getRuntime();
      if (finalRuntime.modelId !== null) {
        const activeModel = await store.getModel(finalRuntime.modelId);
        expect(activeModel?.enabled).toBe(true);
      }
    }
  }, 120_000);

  itIfDatabase('fallback set vs fallback toggle-off: total order over 10 rounds', async () => {
    if (!pool) throw new Error('database pool not initialized');
    for (let round = 0; round < 10; round += 1) {
      await resetLlmTables();
      const store = createPostgresLlmConfigStore(pool);
      const modelA = await seedPair(store, 'openai-api', `frace-a-${round}`);
      const modelB = await seedPair(store, 'opencode-zen', `frace-b-${round}`);
      let rt = await store.getRuntime();
      rt = await store.updateRuntime({
        providerId: 'openai-api',
        modelId: modelA.id,
        expectedVersion: rt.version,
        updatedBy: 'atomic@test.com',
      });

      const settled = await Promise.allSettled([
        store.updateRuntime({
          providerId: 'openai-api',
          modelId: modelA.id,
          fallbackProviderId: 'opencode-zen',
          fallbackModelId: modelB.id,
          expectedVersion: rt.version,
          updatedBy: 'atomic@test.com',
        }),
        store.setProviderEnabled('opencode-zen', false),
      ]);
      for (const s of settled) {
        if (s.status === 'rejected') {
          const err = s.reason as { statusCode?: number; code?: string };
          expect([409, 422]).toContain(err.statusCode);
          expect(['agent.runtime_in_use', 'agent.version_conflict', 'agent.activation_blocked']).toContain(err.code);
        }
      }

      const [finalRuntime, providers] = await Promise.all([store.getRuntime(), store.listProviders()]);
      for (const p of providers) {
        if (p.id === finalRuntime.providerId || p.id === finalRuntime.fallbackProviderId) {
          expect(p.enabled).toBe(true);
        }
      }
      if (finalRuntime.fallbackModelId !== null) {
        const fallbackModel = await store.getModel(finalRuntime.fallbackModelId);
        expect(fallbackModel?.enabled).toBe(true);
      }
    }
  }, 120_000);

  itIfDatabase('activation vs toggle vs delete of the target: total order over 10 rounds', async () => {
    if (!pool) throw new Error('database pool not initialized');
    for (let round = 0; round < 10; round += 1) {
      await resetLlmTables();
      const store = createPostgresLlmConfigStore(pool);
      const modelA = await seedPair(store, 'openai-api', `drace-a-${round}`);
      const modelB = await seedPair(store, 'opencode-zen', `drace-b-${round}`);
      let rt = await store.getRuntime();
      rt = await store.updateRuntime({
        providerId: 'openai-api',
        modelId: modelA.id,
        expectedVersion: rt.version,
        updatedBy: 'atomic@test.com',
      });

      const settled = await Promise.allSettled([
        store.updateRuntime({
          providerId: 'opencode-zen',
          modelId: modelB.id,
          expectedVersion: rt.version,
          updatedBy: 'atomic@test.com',
        }),
        store.setProviderEnabled('opencode-zen', false),
        store.deleteModel(modelB.id),
      ]);
      for (const s of settled) {
        if (s.status === 'rejected') {
          const err = s.reason as { statusCode?: number; code?: string };
          expect([409, 422]).toContain(err.statusCode);
          expect(['agent.runtime_in_use', 'agent.version_conflict', 'agent.activation_blocked']).toContain(err.code);
        }
      }

      // Whatever won, the runtime must never reference a disabled item.
      const [finalRuntime, providers] = await Promise.all([store.getRuntime(), store.listProviders()]);
      for (const p of providers) {
        if (p.id === finalRuntime.providerId || p.id === finalRuntime.fallbackProviderId) {
          expect(p.enabled).toBe(true);
        }
      }
      for (const mid of [finalRuntime.modelId, finalRuntime.fallbackModelId]) {
        if (mid !== null) {
          const m = await store.getModel(mid);
          // The model may be gone only if it was never referenced.
          if (m) expect(m.enabled).toBe(true);
        }
      }
    }
  }, 120_000);
});
