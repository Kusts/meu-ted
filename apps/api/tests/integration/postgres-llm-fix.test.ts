import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../src/db/pool.js';
import { createPostgresLlmConfigStore } from '../../src/agent/llm-config-postgres.js';
import { migrationChecksum, runMigrations } from '../../src/read-models/sql/migrate.js';

const DB_URL = process.env.DATABASE_URL_TEST_FIX ?? process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'read-models', 'sql');
const V042_FILE = 'V042__llm_kind_alignment.sql';

/** This file owns its database: truncating the LLM tables per test is safe. */
const resetLlmTables = async (): Promise<void> => {
  if (!pool) throw new Error('database pool not initialized');
  await pool.query(`TRUNCATE agent_llm_models, agent_llm_providers, agent_llm_runtime_config CASCADE`);
  await pool.query(
    `INSERT INTO agent_llm_runtime_config (singleton, rollout_mode, security_epoch, version)
     VALUES ('active', 'disabled', 1, 1)`,
  );
};

/** Applies every migration except V042 to simulate a legacy base. */
const _applyLegacyBase = async (): Promise<void> => {
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

const runtimeConstraintNames = async (): Promise<string[]> => {
  if (!pool) throw new Error('database pool not initialized');
  const res = await pool.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'agent_llm_runtime_config'::regclass`,
  );
  return res.rows.map((r) => r.conname);
};

/** Mirror of the V042 pair-wise preflight UPDATEs (must stay in sync with the migration). */
const PREFLIGHT_ACTIVE_PTRS = `
UPDATE agent_llm_runtime_config SET provider_id = NULL, model_id = NULL
WHERE singleton = 'active'
  AND (provider_id IS NOT NULL OR model_id IS NOT NULL)
  AND NOT (
    provider_id IS NOT NULL AND model_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM agent_llm_providers p WHERE p.id = agent_llm_runtime_config.provider_id)
    AND EXISTS (
      SELECT 1 FROM agent_llm_models m
      WHERE m.id = agent_llm_runtime_config.model_id
        AND m.provider_id = agent_llm_runtime_config.provider_id
    )
  )`;
const PREFLIGHT_FALLBACK_PTRS = `
UPDATE agent_llm_runtime_config SET fallback_provider_id = NULL, fallback_model_id = NULL
WHERE singleton = 'active'
  AND (fallback_provider_id IS NOT NULL OR fallback_model_id IS NOT NULL)
  AND NOT (
    fallback_provider_id IS NOT NULL AND fallback_model_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM agent_llm_providers p WHERE p.id = agent_llm_runtime_config.fallback_provider_id)
    AND EXISTS (
      SELECT 1 FROM agent_llm_models m
      WHERE m.id = agent_llm_runtime_config.fallback_model_id
        AND m.provider_id = agent_llm_runtime_config.fallback_provider_id
    )
  )`;

describe('Postgres LLM Fase 1b-FIX (items 1/2/4/5/6)', () => {
  beforeAll(async () => {
    if (DB_URL) {
      pool = createPool({ connectionString: DB_URL, max: 4 });
      await runMigrations(pool);
    }
  }, 120_000);

  afterAll(async () => {
    // Leave the SHARED database canonical after per-test TRUNCATEs.
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

  itIfDatabase('item 4: per-kind alias CHECK rejects a mismatched pair', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    await expect(
      pool.query(
        `INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, enabled, eligibility)
         VALUES ('bad-alias', 'anthropic', 'direct', 'api-key', 'OPENAI_API_KEY', false, 'approved')`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  itIfDatabase('item 4: per-kind alias CHECK accepts every contract pair', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    const pairs: Array<[string, string | null]> = [
      ['opencode-zen', 'OPENCODE_ZEN_API_KEY'],
      ['opencode-go', 'OPENCODE_GO_API_KEY'],
      ['openai-api', 'OPENAI_API_KEY'],
      ['openai', 'OPENAI_API_KEY'],
      ['anthropic', 'ANTHROPIC_API_KEY'],
      ['deepseek', 'DEEPSEEK_API_KEY'],
      ['qwen', 'QWEN_API_KEY'],
      ['glm', 'GLM_API_KEY'],
      ['minimax', 'MINIMAX_API_KEY'],
      ['google', 'GOOGLE_API_KEY'],
      ['openrouter', 'OPENROUTER_API_KEY'],
    ];
    for (const [kind, alias] of pairs) {
      const transport = 'direct';
      const authMode = 'api-key';
      await pool.query(
        `INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, enabled, eligibility)
         VALUES ($1, $2, $3, $4, $5, false, 'approved')`,
        [`pair-${kind}`, kind, transport, authMode, alias],
      );
    }
    const res = await pool.query(`SELECT count(*)::int AS n FROM agent_llm_providers`);
    expect((res.rows[0] as { n: number }).n).toBe(pairs.length);
    const codex = await pool.query(
      `INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, enabled, eligibility)
       VALUES ('pair-codex', 'openai-codex-subscription', 'private-broker', 'chatgpt-browser', NULL, false, 'experimental_blocked')
       RETURNING id`,
    );
    expect(codex.rowCount).toBe(1);
  });

/**
 * Resets a database to pre-V042 state (robust across repeated runs).
 * Only V034/V041 texts are re-executed (idempotent by construction after the
 * strip below); the rest of the chain is left untouched.
 */
const resetToPreV042 = async (db: Pool): Promise<void> => {
  await db.query(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY, name TEXT NOT NULL,
      checksum TEXT NOT NULL DEFAULT '', applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  );
  // Strip V042 artifacts from previous runs (tables may or may not exist yet).
  await db.query(`DO $$
    BEGIN
      IF to_regclass('public.agent_llm_runtime_config') IS NOT NULL THEN
        ALTER TABLE agent_llm_runtime_config
          DROP CONSTRAINT IF EXISTS fk_llm_runtime_model,
          DROP CONSTRAINT IF EXISTS fk_llm_runtime_fallback_model,
          DROP CONSTRAINT IF EXISTS fk_llm_runtime_fallback_provider;
      END IF;
      IF to_regclass('public.agent_llm_providers') IS NOT NULL THEN
        ALTER TABLE agent_llm_providers
          DROP CONSTRAINT IF EXISTS chk_llm_provider_kind,
          DROP CONSTRAINT IF EXISTS chk_llm_provider_eligibility,
          DROP CONSTRAINT IF EXISTS chk_llm_secret_alias,
          DROP CONSTRAINT IF EXISTS chk_transport_auth,
          DROP CONSTRAINT IF EXISTS chk_secret_alias;
      END IF;
    END $$`);
  await db.query(`DELETE FROM _migrations WHERE version = 42`);
  // Re-run V034+V041 texts directly (CREATE/ADD IF NOT EXISTS + seeds).
  for (const file of ['V034__agent_llm_configuration.sql', 'V041__llm_fallback.sql']) {
    const sql = readFileSync(join(sqlDir, file), 'utf8');
    await db.query(sql);
    const version = Number(/^V(\d+)__/.exec(file)?.[1]);
    await db.query(
      `INSERT INTO _migrations (version, name, checksum)
       VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING`,
      [version, file, migrationChecksum(sql)],
    );
  }
  await db.query(`TRUNCATE agent_llm_models, agent_llm_providers, agent_llm_runtime_config CASCADE`);
  // Re-seed providers + runtime singleton (TRUNCATE wiped the V034 seeds;
  // both seed INSERTs are ON CONFLICT DO NOTHING).
  const v034 = readFileSync(join(sqlDir, 'V034__agent_llm_configuration.sql'), 'utf8');
  const seedBlock = v034.slice(v034.indexOf('-- Seed:'));
  await db.query(seedBlock);
};

const seedCrossPairs = async (db: Pool): Promise<void> => {
  await db.query(
    `INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, enabled, eligibility, runtime_status)
     VALUES ('openai-api', 'openai-api', 'direct', 'api-key', 'OPENAI_API_KEY', true, 'approved', 'ready'),
            ('opencode-zen', 'opencode-zen', 'direct', 'api-key', 'OPENCODE_ZEN_API_KEY', true, 'approved', 'ready')
     ON CONFLICT (id) DO NOTHING`,
  );
  await db.query(
    `INSERT INTO agent_llm_models (id, provider_id, model_id, protocol, privacy_class, retention, enabled)
     VALUES ('openai-api:cross-a', 'openai-api', 'cross-a', 'chat-completions', 'training_prohibited', NULL, true),
            ('opencode-zen:cross-b', 'opencode-zen', 'cross-b', 'chat-completions', 'training_prohibited', NULL, true)
     ON CONFLICT (provider_id, model_id) DO NOTHING`,
  );
};

describe('Postgres LLM pre-V042 legacy base (item 5)', () => {
  let legacy: Pool | undefined;
  const legacyUrl = process.env.DATABASE_URL_TEST_FIX_LEGACY;

  beforeAll(async () => {
    if (legacyUrl && process.env.DB_TEST_MARKER) {
      legacy = createPool({ connectionString: legacyUrl, max: 2 });
    }
  });

  afterAll(async () => {
    await legacy?.end();
  });

  const itIfLegacy = legacyUrl && process.env.DB_TEST_MARKER ? it : it.skip;

  itIfLegacy('item 5: preflight fixes a cross active pair and preserves a valid fallback pair', async () => {
    if (!legacy) throw new Error('legacy database pool not initialized');
    await resetToPreV042(legacy);
    await seedCrossPairs(legacy);
    await legacy.query(
      `UPDATE agent_llm_runtime_config
       SET provider_id = 'openai-api', model_id = 'opencode-zen:cross-b',
           fallback_provider_id = 'opencode-zen', fallback_model_id = 'opencode-zen:cross-b',
           version = 1
       WHERE singleton = 'active'`,
    );
    await runMigrations(legacy);
    const rt = await legacy.query(`SELECT provider_id, model_id, fallback_provider_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active'`);
    const row = rt.rows[0] as Record<string, unknown>;
    expect(row['provider_id']).toBeNull();
    expect(row['model_id']).toBeNull();
    expect(row['fallback_provider_id']).toBe('opencode-zen');
    expect(row['fallback_model_id']).toBe('opencode-zen:cross-b');
  });

  itIfLegacy('item 5: preflight fixes a cross fallback pair and preserves a valid active pair', async () => {
    if (!legacy) throw new Error('legacy database pool not initialized');
    await resetToPreV042(legacy);
    await seedCrossPairs(legacy);
    await legacy.query(
      `UPDATE agent_llm_runtime_config
       SET provider_id = 'openai-api', model_id = 'openai-api:cross-a',
           fallback_provider_id = 'opencode-zen', fallback_model_id = 'openai-api:cross-a',
           version = 1
       WHERE singleton = 'active'`,
    );
    await runMigrations(legacy);
    const rt = await legacy.query(`SELECT provider_id, model_id, fallback_provider_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active'`);
    const row = rt.rows[0] as Record<string, unknown>;
    expect(row['provider_id']).toBe('openai-api');
    expect(row['model_id']).toBe('openai-api:cross-a');
    expect(row['fallback_provider_id']).toBeNull();
    expect(row['fallback_model_id']).toBeNull();
    // Idempotence: re-running the preflight UPDATEs changes zero rows.
    const before = await legacy.query(`SELECT provider_id, model_id, fallback_provider_id, fallback_model_id, version FROM agent_llm_runtime_config WHERE singleton = 'active'`);
    const r1 = await legacy.query(PREFLIGHT_ACTIVE_PTRS);
    const r2 = await legacy.query(PREFLIGHT_FALLBACK_PTRS);
    expect(r1.rowCount).toBe(0);
    expect(r2.rowCount).toBe(0);
    const after = await legacy.query(`SELECT provider_id, model_id, fallback_provider_id, fallback_model_id, version FROM agent_llm_runtime_config WHERE singleton = 'active'`);
    expect(after.rows).toEqual(before.rows);
  });
});

  itIfDatabase('item 6: activation target disabled between version read and commit is rejected on Postgres', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    const store = createPostgresLlmConfigStore(pool);
    await store.upsertProvider({
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    const modelA = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'race-a',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    let rt = await store.getRuntime();
    rt = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: modelA.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });
    await store.upsertProvider({
      id: 'opencode-zen',
      kind: 'opencode-zen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    const target = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'race-target',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const readVersion = (await store.getRuntime()).version;
    // A concurrent toggle wins the race: target disabled, version untouched.
    await store.setProviderEnabled('opencode-zen', false);
    await expect(
      store.updateRuntime({
        providerId: 'opencode-zen',
        modelId: target.id,
        expectedVersion: readVersion,
        updatedBy: 'fix@test.com',
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'agent.activation_blocked' });
    const after = await store.getRuntime();
    expect(after.providerId).toBe('openai-api');
    expect(after.modelId).toBe(modelA.id);
    expect(after.version).toBe(readVersion);
  });

  itIfDatabase('Fase 3 item 2: referenced-model compat + identity guards hold on Postgres', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    const store = createPostgresLlmConfigStore(pool);
    await store.upsertProvider({
      id: 'anthropic',
      kind: 'anthropic',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'ANTHROPIC_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    const model = await store.upsertModel({
      providerId: 'anthropic',
      modelId: 'claude-x',
      protocol: 'messages',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    let rt = await store.getRuntime();
    rt = await store.updateRuntime({
      providerId: 'anthropic',
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: 'fase3@test.com',
    });
    // Incompatible protocol on the referenced model → 422 with the compat reason.
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
    // Identity change of the referenced model → 409 (never a dangling runtime ref).
    await expect(
      store.upsertModel({
        id: model.id,
        providerId: 'anthropic',
        modelId: 'claude-y',
        protocol: 'messages',
        privacyClass: 'training_prohibited',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'agent.runtime_in_use', reason: 'active_model' });
    const after = await store.getModel(model.id);
    expect(after?.modelId).toBe('claude-x');
    expect(after?.protocol).toBe('messages');
    expect((await store.getRuntime()).modelId).toBe(model.id);
    expect((await store.getRuntime()).version).toBe(rt.version);
  });

  itIfDatabase('Fase 3-FIX R1: provider kind switch revalidates the active pair on Postgres', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    const store = createPostgresLlmConfigStore(pool);
    await store.upsertProvider({
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    const model = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'gpt-4o',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    let rt = await store.getRuntime();
    rt = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: model.id,
      expectedVersion: rt.version,
      updatedBy: 'fase3fix@test.com',
    });
    // Audit repro 4.2: switching the referenced provider to an executable
    // kind that cannot run the active model protocol is rejected.
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
    // A switch between compatible executable kinds still applies. NOTE (H-08):
    // 'openai' is a legacy alias normalized to 'openai-api' before persisting,
    // so it can no longer exercise a real kind switch — use 'deepseek'
    // (chat-completions compatible, own secret alias) instead.
    const switched = await store.upsertProvider({
      id: 'openai-api',
      kind: 'deepseek',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'DEEPSEEK_API_KEY',
    });
    expect(switched.kind).toBe('deepseek');
    expect((await store.getRuntime()).version).toBe(rt.version);
  });

  itIfDatabase('item 6: concurrent activate and toggle-off-target never reference a disabled pair', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    const store = createPostgresLlmConfigStore(pool);
    await store.upsertProvider({
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    const modelA = await store.upsertModel({
      providerId: 'openai-api',
      modelId: 'crace-a',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    let rt = await store.getRuntime();
    rt = await store.updateRuntime({
      providerId: 'openai-api',
      modelId: modelA.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });
    await store.upsertProvider({
      id: 'opencode-zen',
      kind: 'opencode-zen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    const modelB = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'crace-b',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const settled = await Promise.allSettled([
      store.updateRuntime({
        providerId: 'opencode-zen',
        modelId: modelB.id,
        expectedVersion: rt.version,
        updatedBy: 'fix@test.com',
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
  });

  itIfDatabase('D1: raw DELETE of the fallback provider is rejected (NO ACTION, 23503)', async () => {
    if (!pool) throw new Error('database pool not initialized');
    await resetLlmTables();
    const store = createPostgresLlmConfigStore(pool);
    await store.upsertProvider({
      id: 'opencode-zen',
      kind: 'opencode-zen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY',
      enabled: true,
      eligibility: 'approved',
    });
    const fbModel = await store.upsertModel({
      providerId: 'opencode-zen',
      modelId: 'zen-fb',
      protocol: 'chat-completions',
      privacyClass: 'training_prohibited',
      enabled: true,
    });
    const rt = await store.getRuntime();
    await store.updateRuntime({
      providerId: null,
      modelId: null,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: fbModel.id,
      expectedVersion: rt.version,
      updatedBy: 'fix@test.com',
    });
    await expect(pool.query(`DELETE FROM agent_llm_providers WHERE id = 'opencode-zen'`)).rejects.toMatchObject({
      code: '23503',
    });
    const names = await runtimeConstraintNames();
    expect(names).toContain('fk_llm_runtime_fallback_provider');
    expect(names).not.toContain('agent_llm_runtime_config_fallback_provider_id_fkey');
  });
});
