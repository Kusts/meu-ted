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

const runtimeConstraintNames = async (): Promise<string[]> => {
  if (!pool) throw new Error('database pool not initialized');
  const res = await pool.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE conrelid = 'agent_llm_runtime_config'::regclass`,
  );
  return res.rows.map((r) => r.conname);
};

describe('Postgres LLM Fase 1b-FIX (items 1/2/4/5/6)', () => {
  beforeAll(async () => {
    if (DB_URL) {
      pool = createPool({ connectionString: DB_URL, max: 4 });
      await runMigrations(pool);
    }
  });

  afterAll(async () => {
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
    const rt = await store.getRuntime();
    await store.updateRuntime({
      providerId: null,
      modelId: null,
      fallbackProviderId: 'opencode-zen',
      fallbackModelId: null,
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
