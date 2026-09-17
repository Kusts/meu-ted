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
const applyLegacyBase = async (): Promise<void> => {  if (!pool) throw new Error('database pool not initialized');
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

/**
 * Owns the V042 window on the SHARED test database. Sibling files may have
 * left V042 applied (second suite run) or wiped the V034 seeds (the TRUNCATE
 * in postgres-llm-fix), and V044 seeds kinds V042's CHECK does not know
 * ('kimi') — so a naive re-apply would fail validation. Strip only the V042
 * runtime FKs, detach any runtime slot pointing at a V044-only provider,
 * drop those seed rows, rewind 42..44 (V043/V044 re-apply idempotently and
 * V044 restores its seeds) and re-seed the V034 base rows, so the legacy-base
 * simulation below is deterministic on fresh, populated, and second-run DBs.
 */
const resetToPreV042Window = async (): Promise<void> => {
  if (!pool) throw new Error('database pool not initialized');
  await pool.query(`DO $$
    BEGIN
      IF to_regclass('public.agent_llm_runtime_config') IS NOT NULL THEN
        ALTER TABLE agent_llm_runtime_config
          DROP CONSTRAINT IF EXISTS fk_llm_runtime_model,
          DROP CONSTRAINT IF EXISTS fk_llm_runtime_fallback_model,
          DROP CONSTRAINT IF EXISTS fk_llm_runtime_fallback_provider;
      END IF;
      -- V042's own DROPs only cover the V034 anonymous names, NOT these
      -- named constraints (nor V044's widened kind CHECK): re-applying V042
      -- without stripping them first fails with "already exists".
      IF to_regclass('public.agent_llm_providers') IS NOT NULL THEN
        ALTER TABLE agent_llm_providers
          DROP CONSTRAINT IF EXISTS chk_llm_provider_kind,
          DROP CONSTRAINT IF EXISTS chk_llm_provider_eligibility,
          DROP CONSTRAINT IF EXISTS chk_llm_secret_alias;
      END IF;
    END $$`);
  await pool.query(
    `UPDATE agent_llm_runtime_config
        SET provider_id = NULL, model_id = NULL
      WHERE singleton = 'active' AND provider_id IN ('kimi', 'openai')`,
  ).catch(() => undefined);
  await pool.query(
    `UPDATE agent_llm_runtime_config
        SET fallback_provider_id = NULL, fallback_model_id = NULL
      WHERE singleton = 'active'
        AND (fallback_provider_id IN ('kimi', 'openai'))`,
  ).catch(() => undefined);
  await pool.query(`DELETE FROM agent_llm_providers WHERE id IN ('kimi', 'openai')`);
  await pool.query(`DELETE FROM _migrations WHERE version IN (42, 43, 44)`);
  // V034 base seeds (sibling TRUNCATEs may have wiped them; every INSERT is
  // ON CONFLICT DO NOTHING so this is safe on fresh databases too).
  await pool.query(
    `INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, eligibility, runtime_status, enabled) VALUES
      ('opencode-zen','opencode-zen','direct','api-key','OPENCODE_ZEN_API_KEY','approved','not_configured', false),
      ('opencode-go','opencode-go','direct','api-key','OPENCODE_GO_API_KEY','approved','not_configured', false),
      ('openai-api','openai-api','direct','api-key','OPENAI_API_KEY','approved','not_configured', false),
      ('openai-codex-subscription','openai-codex-subscription','private-broker','chatgpt-browser', NULL,'experimental_blocked','not_configured', false)
     ON CONFLICT (id) DO NOTHING`,
  );
  await pool.query(
    `INSERT INTO agent_llm_runtime_config (singleton, rollout_mode, security_epoch, version)
     VALUES ('active','disabled',1,1) ON CONFLICT (singleton) DO NOTHING`,
  );
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
    // Own the window AFTER the legacy base fill: rewind 42..44 so V042
    // re-applies below even on populated/second-run databases (V044 seeds
    // are restored by its own re-apply inside runMigrations).
    await resetToPreV042Window();

    // Legacy data: the V034 seed provider exists again (reset above); model
    // refs have no FK yet, so orphan ids are insertable — exactly what V042
    // preflight must clean.
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

    // Sibling files may have wiped the V034 seeds (TRUNCATE in
    // postgres-llm-fix) — ensure the provider row first so this test owns
    // its seed on fresh, populated, and second-run databases.
    await store.upsertProvider({
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
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
