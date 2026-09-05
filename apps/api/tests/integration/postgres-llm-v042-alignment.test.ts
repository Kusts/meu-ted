import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { createPostgresLlmConfigStore } from '../../src/agent/llm-config-postgres.js';
import {
  expectedMigrationManifest,
  migrationChecksum,
  runMigrations,
} from '../../src/read-models/sql/migrate.js';

const DB_URL = process.env.DATABASE_URL_TEST_V042 ?? process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'read-models', 'sql');
const V042_FILE = 'V042__llm_kind_alignment.sql';

const constraintNames = async (): Promise<string[]> => {
  if (!pool) throw new Error('database pool not initialized');
  const res = await pool.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conrelid IN ('agent_llm_providers'::regclass, 'agent_llm_runtime_config'::regclass)`,
  );
  return res.rows.map((r) => r.conname);
};

/** Applies every migration except V042 to simulate a legacy base. */
const applyLegacyBase = async (): Promise<void> => {
  if (!pool) throw new Error('database pool not initialized');
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL DEFAULT '',
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  const files = readdirSync(sqlDir)
    .filter((f) => /^V(\d+)__[\w-]+\.sql$/.test(f) && f !== V042_FILE)
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const version = Number(/^V(\d+)__/.exec(file)?.[1]);
    const already = await pool.query('SELECT 1 FROM _migrations WHERE version = $1', [version]);
    if ((already.rowCount ?? 0) > 0) continue;
    const sql = readFileSync(join(sqlDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (version, name, checksum) VALUES ($1, $2, $3)', [
        version,
        file,
        migrationChecksum(sql),
      ]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

describe('Postgres LLM V042 kind alignment (Fase 1b RED)', () => {
  beforeAll(async () => {
    if (DB_URL) {
      pool = createPool({ connectionString: DB_URL, max: 2 });
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase('applies V042 on a legacy base with orphan references (preflight nulls them)', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await applyLegacyBase();

    // Legacy data: valid provider seed exists (V034); model refs have no FK yet,
    // so orphan ids are insertable — exactly what V042 preflight must clean.
    await pool.query(
      `INSERT INTO agent_llm_models (id, provider_id, model_id, protocol, privacy_class, retention, enabled)
       VALUES ('openai-api:legacy-1', 'openai-api', 'legacy-1', 'chat-completions', 'training_prohibited', NULL, true)
       ON CONFLICT (provider_id, model_id) DO NOTHING`,
    );
    await pool.query(
      `UPDATE agent_llm_runtime_config SET provider_id = 'openai-api', model_id = 'ghost:gone',
        fallback_provider_id = NULL, fallback_model_id = 'ghost:fb', version = 1
       WHERE singleton = 'active'`,
    );

    const { applied } = await runMigrations(pool);
    expect(applied).toContain(42);

    const rt = await pool.query(
      `SELECT provider_id, model_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active'`,
    );
    const row = rt.rows[0] as Record<string, unknown>;
    // Orphan active pair nulled together (active_pair CHECK), orphan fallback nulled.
    expect(row['provider_id']).toBeNull();
    expect(row['model_id']).toBeNull();
    expect(row['fallback_model_id']).toBeNull();

    const names = await constraintNames();
    for (const expected of [
      'chk_llm_provider_kind',
      'chk_llm_provider_eligibility',
      'chk_llm_secret_alias',
      'fk_llm_runtime_model',
      'fk_llm_runtime_fallback_model',
    ]) {
      expect(names).toContain(expected);
    }
    expect(names).not.toContain('agent_llm_providers_kind_check');
    expect(names).not.toContain('agent_llm_providers_eligibility_check');
  });

  itIfDatabase('persists and reads an anthropic provider blocked by the old V034 CHECK', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await runMigrations(pool);
    const store = createPostgresLlmConfigStore(pool);
    const provider = await store.upsertProvider({
      id: 'anthropic-it',
      kind: 'anthropic',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'ANTHROPIC_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    expect(provider.kind).toBe('anthropic');
    expect((await store.getProvider('anthropic-it'))?.secretAlias).toBe('ANTHROPIC_API_KEY');
    await pool.query(`DELETE FROM agent_llm_providers WHERE id = 'anthropic-it'`);
  });

  itIfDatabase('model FK blocks raw DELETE of the active model; store maps active and fallback deletes to 409', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await runMigrations(pool);
    const store = createPostgresLlmConfigStore(pool);

    const active = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'v042-active',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const fallback = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'v042-fallback',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    await store.setProviderEnabled('openai-api', true);
    let rt = await store.getRuntime();
    rt = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: active.id,
      fallbackProviderId: 'openai-api',
      fallbackModelId: fallback.id,
      expectedVersion: rt.version,
      updatedBy: 'v042@test.com',
    });
    expect(rt.fallbackModelId).toBe(fallback.id);

    // Store-level guards reject both slots with 409 before touching FKs.
    await expect(store.deleteModel(active.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'active_model',
    });
    await expect(store.deleteModel(fallback.id)).rejects.toMatchObject({
      statusCode: 409,
      code: 'agent.runtime_in_use',
      reason: 'fallback_model',
    });

    // DB-level proof: bypassing the store, the new FK rejects with 23503.
    await expect(pool.query(`DELETE FROM agent_llm_models WHERE id = $1`, [active.id])).rejects.toMatchObject({
      code: '23503',
    });
    await expect(pool.query(`DELETE FROM agent_llm_models WHERE id = $1`, [fallback.id])).rejects.toMatchObject({
      code: '23503',
    });
  });

  itIfDatabase('V042 is part of the legacy-safe manifest', () => {
    expect(expectedMigrationManifest(true).map((e) => e.version)).toContain(42);
  });
});
