import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { createPostgresLlmConfigStore } from '../../src/agent/llm-config-postgres.js';
import { runMigrations } from '../../src/read-models/sql/migrate.js';

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

describe('Postgres Agent LLM Configuration Store Integration', () => {
  beforeAll(async () => {
    if (DB_URL) {
      pool = createPool({ connectionString: DB_URL, max: 2 });
      await runMigrations(pool);
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase('lists seeded providers and active runtime config', async () => {
    if (!pool) throw new Error('database pool not initialized');
    const store = createPostgresLlmConfigStore(pool);
    const providers = await store.listProviders();
    expect(providers.length).toBeGreaterThanOrEqual(4);

    const zen = providers.find((p) => p.id === 'opencode-zen');
    expect(zen).toBeDefined();
    expect(zen?.kind).toBe('opencode-zen');
    expect(zen?.transport).toBe('direct');
    expect(zen?.authMode).toBe('api-key');
    expect(zen?.secretAlias).toBe('OPENCODE_ZEN_API_KEY');
    expect(zen?.eligibility).toBe('approved');

    const codex = providers.find((p) => p.id === 'openai-codex-subscription');
    expect(codex).toBeDefined();
    expect(codex?.eligibility).toBe('experimental_blocked');

    const runtime = await store.getRuntime();
    expect(runtime.singleton).toBe('active');
  });

  itIfDatabase('upserts model, updates runtime with optimistic lock, and bumps epoch', async () => {
    if (!pool) throw new Error('database pool not initialized');
    const store = createPostgresLlmConfigStore(pool);

    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o-integration',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    expect(model.modelId).toBe('gpt-4o-integration');

    await store.setProviderEnabled('openai-api', true);

    const cur = await store.getRuntime();
    const updated = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      rolloutMode: 'canary',
      canaryAllowlist: ['ws-integration-1'],
      expectedVersion: cur.version,
      updatedBy: 'integration@test.com',
    });

    expect(updated.version).toBe(cur.version + 1);
    expect(updated.providerId).toBe('openai-api');
    expect(updated.modelId).toBe(model.id);

    // Stale version must throw 409
    await expect(
      store.updateRuntime({
        providerId: 'openai-api',
        modelId: model.id,
        expectedVersion: cur.version,
        updatedBy: 'integration@test.com',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.version_conflict',
    });

    const bumped = await store.bumpSecurityEpoch('admin@test.com');
    expect(bumped.securityEpoch).toBe(cur.securityEpoch + 1);
    expect(bumped.version).toBe(updated.version + 1);
  });
});
