import type { Pool } from 'pg';
import {
  type LlmModel,
  type LlmProvider,
  type Protocol,
  type PrivacyClass,
  type RuntimeConfig,
  type RuntimeStatus,
} from './llm-config.js';

export type LlmConfigStore = {
  listProviders(): Promise<LlmProvider[]>;
  getProvider(id: string): Promise<LlmProvider | null>;
  upsertProvider(input: {
    id: string;
    kind: LlmProvider['kind'];
    transport: LlmProvider['transport'];
    authMode: LlmProvider['authMode'];
    secretAlias: LlmProvider['secretAlias'];
    enabled?: boolean;
    eligibility?: LlmProvider['eligibility'];
    runtimeStatus?: LlmProvider['runtimeStatus'];
  }): Promise<LlmProvider>;
  deleteProvider(id: string): Promise<void>;
  listModels(): Promise<LlmModel[]>;
  getModel(id: string): Promise<LlmModel | null>;
  getRuntime(): Promise<RuntimeConfig>;
  updateRuntime(input: {
    providerId: string | null;
    modelId: string | null;
    fallbackProviderId?: string | null;
    fallbackModelId?: string | null;
    rolloutMode?: RuntimeConfig['rolloutMode'];
    canaryAllowlist?: string[];
    expectedVersion: number;
    updatedBy: string;
  }): Promise<RuntimeConfig>;
  setProviderEnabled(id: string, enabled: boolean): Promise<LlmProvider>;
  setProviderRuntimeStatus(id: string, runtimeStatus: RuntimeStatus): Promise<LlmProvider>;
  setModelEnabled(id: string, enabled: boolean): Promise<LlmModel>;
  upsertModel(input: {
    id?: string;
    providerId: string;
    modelId: string;
    protocol: Protocol;
    privacyClass: PrivacyClass;
    retention?: string | null;
    enabled?: boolean;
  }): Promise<LlmModel>;
  deleteModel(id: string): Promise<void>;
  bumpSecurityEpoch(updatedBy?: string): Promise<RuntimeConfig>;
};

export const createPostgresLlmConfigStore = (pool: Pool): LlmConfigStore => ({
  async listProviders() {
    const res = await pool.query(
      `SELECT id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by
       FROM agent_llm_providers ORDER BY id`,
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r['id'] as string,
      kind: r['kind'] as LlmProvider['kind'],
      transport: r['transport'] as LlmProvider['transport'],
      authMode: r['auth_mode'] as LlmProvider['authMode'],
      secretAlias: (r['secret_alias'] as LlmProvider['secretAlias']) ?? null,
      serviceAlias: (r['service_alias'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      eligibility: r['eligibility'] as LlmProvider['eligibility'],
      runtimeStatus: r['runtime_status'] as LlmProvider['runtimeStatus'],
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
      updatedAt: r['updated_at'] ? String(r['updated_at']) : undefined,
      updatedBy: (r['updated_by'] as string) ?? null,
    }));
  },

  async getProvider(id: string) {
    const res = await pool.query(
      `SELECT id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by
       FROM agent_llm_providers WHERE id = $1`,
      [id],
    );
    if (res.rowCount === 0) return null;
    const r = res.rows[0] as Record<string, unknown>;
    return {
      id: r['id'] as string,
      kind: r['kind'] as LlmProvider['kind'],
      transport: r['transport'] as LlmProvider['transport'],
      authMode: r['auth_mode'] as LlmProvider['authMode'],
      secretAlias: (r['secret_alias'] as LlmProvider['secretAlias']) ?? null,
      serviceAlias: (r['service_alias'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      eligibility: r['eligibility'] as LlmProvider['eligibility'],
      runtimeStatus: r['runtime_status'] as LlmProvider['runtimeStatus'],
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
      updatedAt: r['updated_at'] ? String(r['updated_at']) : undefined,
      updatedBy: (r['updated_by'] as string) ?? null,
    };
  },

  async listModels() {
    const res = await pool.query(
      `SELECT id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at
       FROM agent_llm_models ORDER BY provider_id, model_id`,
    );
    return res.rows.map((r: Record<string, unknown>) => ({
      id: r['id'] as string,
      providerId: r['provider_id'] as string,
      modelId: r['model_id'] as string,
      protocol: r['protocol'] as LlmModel['protocol'],
      privacyClass: r['privacy_class'] as LlmModel['privacyClass'],
      retention: (r['retention'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
    }));
  },

  async getModel(id: string) {
    const res = await pool.query(
      `SELECT id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at
       FROM agent_llm_models WHERE id = $1`,
      [id],
    );
    if (res.rowCount === 0) return null;
    const r = res.rows[0] as Record<string, unknown>;
    return {
      id: r['id'] as string,
      providerId: r['provider_id'] as string,
      modelId: r['model_id'] as string,
      protocol: r['protocol'] as LlmModel['protocol'],
      privacyClass: r['privacy_class'] as LlmModel['privacyClass'],
      retention: (r['retention'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
    };
  },

  async getRuntime() {
    try {
      const res = await pool.query(
        `SELECT singleton, provider_id, model_id, fallback_provider_id, fallback_model_id, rollout_mode, canary_allowlist, security_epoch, version, updated_at, updated_by
         FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const r = res.rows[0] as Record<string, unknown> | undefined;
      if (!r) {
        return {
          singleton: 'active',
          providerId: null,
          modelId: null,
          fallbackProviderId: null,
          fallbackModelId: null,
          rolloutMode: 'disabled',
          canaryAllowlist: [],
          securityEpoch: 1,
          version: 1,
        };
      }
      return {
        singleton: 'active',
        providerId: (r['provider_id'] as string) ?? null,
        modelId: (r['model_id'] as string) ?? null,
        fallbackProviderId: (r['fallback_provider_id'] as string) ?? null,
        fallbackModelId: (r['fallback_model_id'] as string) ?? null,
        rolloutMode: r['rollout_mode'] as RuntimeConfig['rolloutMode'],
        canaryAllowlist: (r['canary_allowlist'] as string[]) ?? [],
        securityEpoch: Number(r['security_epoch']),
        version: Number(r['version']),
        updatedAt: r['updated_at'] ? String(r['updated_at']) : undefined,
        updatedBy: (r['updated_by'] as string) ?? null,
      };
    } catch {
      const res = await pool.query(
        `SELECT singleton, provider_id, model_id, rollout_mode, canary_allowlist, security_epoch, version, updated_at, updated_by
         FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const r = res.rows[0] as Record<string, unknown> | undefined;
      if (!r) {
        return {
          singleton: 'active',
          providerId: null,
          modelId: null,
          fallbackProviderId: null,
          fallbackModelId: null,
          rolloutMode: 'disabled',
          canaryAllowlist: [],
          securityEpoch: 1,
          version: 1,
        };
      }
      return {
        singleton: 'active',
        providerId: (r['provider_id'] as string) ?? null,
        modelId: (r['model_id'] as string) ?? null,
        fallbackProviderId: null,
        fallbackModelId: null,
        rolloutMode: r['rollout_mode'] as RuntimeConfig['rolloutMode'],
        canaryAllowlist: (r['canary_allowlist'] as string[]) ?? [],
        securityEpoch: Number(r['security_epoch']),
        version: Number(r['version']),
        updatedAt: r['updated_at'] ? String(r['updated_at']) : undefined,
        updatedBy: (r['updated_by'] as string) ?? null,
      };
    }
  },

  async updateRuntime(input) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT version FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      if (cur.rowCount === 0) {
        throw Object.assign(new Error('runtime config row missing'), { statusCode: 500 });
      }
      const version = Number((cur.rows[0] as Record<string, unknown>)['version']);
      if (version !== input.expectedVersion) {
        throw Object.assign(new Error('version conflict'), {
          statusCode: 409,
          code: 'agent.version_conflict',
        });
      }
      let r: Record<string, unknown>;
      await client.query('SAVEPOINT pre_fallback_check');
      try {
        const res = await client.query(
          `UPDATE agent_llm_runtime_config
           SET provider_id = $1,
               model_id = $2,
               fallback_provider_id = CASE WHEN $6::boolean THEN $7 ELSE fallback_provider_id END,
               fallback_model_id = CASE WHEN $8::boolean THEN $9 ELSE fallback_model_id END,
               rollout_mode = COALESCE($3, rollout_mode),
               canary_allowlist = COALESCE($4, canary_allowlist),
               version = version + 1,
               updated_at = NOW(),
               updated_by = $5
           WHERE singleton = 'active'
           RETURNING singleton, provider_id, model_id, fallback_provider_id, fallback_model_id, rollout_mode, canary_allowlist, security_epoch, version, updated_at, updated_by`,
          [
            input.providerId,
            input.modelId,
            input.rolloutMode ?? null,
            input.canaryAllowlist ?? null,
            input.updatedBy,
            input.fallbackProviderId !== undefined,
            input.fallbackProviderId ?? null,
            input.fallbackModelId !== undefined,
            input.fallbackModelId ?? null,
          ],
        );
        r = res.rows[0] as Record<string, unknown>;
        await client.query('RELEASE SAVEPOINT pre_fallback_check');
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code !== '42703') throw err;
        await client.query('ROLLBACK TO SAVEPOINT pre_fallback_check');
        const res = await client.query(
          `UPDATE agent_llm_runtime_config
           SET provider_id = $1,
               model_id = $2,
               rollout_mode = COALESCE($3, rollout_mode),
               canary_allowlist = COALESCE($4, canary_allowlist),
               version = version + 1,
               updated_at = NOW(),
               updated_by = $5
           WHERE singleton = 'active'
           RETURNING singleton, provider_id, model_id, rollout_mode, canary_allowlist, security_epoch, version, updated_at, updated_by`,
          [
            input.providerId,
            input.modelId,
            input.rolloutMode ?? null,
            input.canaryAllowlist ?? null,
            input.updatedBy,
          ],
        );
        r = res.rows[0] as Record<string, unknown>;
        await client.query('RELEASE SAVEPOINT pre_fallback_check');
      }
      await client.query('COMMIT');
      return {
        singleton: 'active',
        providerId: (r['provider_id'] as string) ?? null,
        modelId: (r['model_id'] as string) ?? null,
        fallbackProviderId: (r['fallback_provider_id'] as string) ?? null,
        fallbackModelId: (r['fallback_model_id'] as string) ?? null,
        rolloutMode: r['rollout_mode'] as RuntimeConfig['rolloutMode'],
        canaryAllowlist: (r['canary_allowlist'] as string[]) ?? [],
        securityEpoch: Number(r['security_epoch']),
        version: Number(r['version']),
        updatedAt: String(r['updated_at']),
        updatedBy: (r['updated_by'] as string) ?? null,
      };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async setProviderEnabled(id, enabled) {
    // Atomic: the runtime guard lives inside the UPDATE, so an activation
    // racing this toggle cannot slip between a check and the write.
    const res = await pool.query(
      `UPDATE agent_llm_providers
       SET enabled = $2, updated_at = NOW()
       WHERE id = $1
         AND ($2 = true OR NOT EXISTS (
           SELECT 1 FROM agent_llm_runtime_config
           WHERE singleton = 'active' AND (provider_id = $1 OR fallback_provider_id = $1)
         ))
       RETURNING id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by`,
      [id, enabled],
    );
    if (res.rowCount === 0) {
      const existing = await pool.query(
        `SELECT id FROM agent_llm_providers WHERE id = $1`,
        [id],
      );
      if ((existing.rowCount ?? 0) === 0) {
        throw Object.assign(new Error(`provider ${id} not found`), { statusCode: 404 });
      }
      const rt = await pool.query(
        `SELECT provider_id, fallback_provider_id FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      const reason =
        row?.['provider_id'] === id
          ? 'active_provider'
          : row?.['fallback_provider_id'] === id
            ? 'fallback_provider'
            : 'runtime_in_use';
      throw Object.assign(new Error('provider is runtime in use'), {
        statusCode: 409,
        code: 'agent.runtime_in_use',
        reason,
      });
    }
    const r = res.rows[0] as Record<string, unknown>;
    return {
      id: r['id'] as string,
      kind: r['kind'] as LlmProvider['kind'],
      transport: r['transport'] as LlmProvider['transport'],
      authMode: r['auth_mode'] as LlmProvider['authMode'],
      secretAlias: (r['secret_alias'] as LlmProvider['secretAlias']) ?? null,
      serviceAlias: (r['service_alias'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      eligibility: r['eligibility'] as LlmProvider['eligibility'],
      runtimeStatus: r['runtime_status'] as LlmProvider['runtimeStatus'],
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
      updatedAt: r['updated_at'] ? String(r['updated_at']) : undefined,
      updatedBy: (r['updated_by'] as string) ?? null,
    };
  },

  async setProviderRuntimeStatus(id, status) {
    const res = await pool.query(
      `UPDATE agent_llm_providers
       SET runtime_status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by`,
      [id, status],
    );
    if (res.rowCount === 0) {
      throw Object.assign(new Error(`provider ${id} not found`), { statusCode: 404 });
    }
    const r = res.rows[0] as Record<string, unknown>;
    return {
      id: r['id'] as string,
      kind: r['kind'] as LlmProvider['kind'],
      transport: r['transport'] as LlmProvider['transport'],
      authMode: r['auth_mode'] as LlmProvider['authMode'],
      secretAlias: (r['secret_alias'] as LlmProvider['secretAlias']) ?? null,
      serviceAlias: (r['service_alias'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      eligibility: r['eligibility'] as LlmProvider['eligibility'],
      runtimeStatus: r['runtime_status'] as LlmProvider['runtimeStatus'],
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
      updatedAt: r['updated_at'] ? String(r['updated_at']) : undefined,
      updatedBy: (r['updated_by'] as string) ?? null,
    };
  },

  async upsertProvider(input) {
    // Fase 1b-FIX item 1: ON CONFLICT never touches `enabled` — an upsert
    // (create route, sync) must not disable an active/fallback provider
    // outside the guarded toggle path. New rows still default to disabled.
    const res = await pool.query(
      `INSERT INTO agent_llm_providers (id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, false), COALESCE($8, 'approved'), COALESCE($9, 'not_configured'))
       ON CONFLICT (id) DO UPDATE SET
          kind = EXCLUDED.kind,
          transport = EXCLUDED.transport,
          auth_mode = EXCLUDED.auth_mode,
          secret_alias = EXCLUDED.secret_alias,
          service_alias = EXCLUDED.service_alias,
          eligibility = COALESCE(EXCLUDED.eligibility, agent_llm_providers.eligibility),
          runtime_status = COALESCE(EXCLUDED.runtime_status, agent_llm_providers.runtime_status),
          updated_at = NOW()
       RETURNING id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by`,
      [
        input.id,
        input.kind,
        input.transport,
        input.authMode,
        input.secretAlias,
        null,
        input.enabled ?? null,
        input.eligibility ?? null,
        input.runtimeStatus ?? null,
      ],
    );
    const r = res.rows[0] as Record<string, unknown>;
    return {
      id: r['id'] as string,
      kind: r['kind'] as LlmProvider['kind'],
      transport: r['transport'] as LlmProvider['transport'],
      authMode: r['auth_mode'] as LlmProvider['authMode'],
      secretAlias: (r['secret_alias'] as LlmProvider['secretAlias']) ?? null,
      serviceAlias: (r['service_alias'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      eligibility: r['eligibility'] as LlmProvider['eligibility'],
      runtimeStatus: r['runtime_status'] as LlmProvider['runtimeStatus'],
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
      updatedAt: r['updated_at'] ? String(r['updated_at']) : undefined,
      updatedBy: (r['updated_by'] as string) ?? null,
    };
  },

  async deleteProvider(id: string) {
    let deleted = 0;
    try {
      const res = await pool.query(
        `DELETE FROM agent_llm_providers
         WHERE id = $1
           AND NOT EXISTS (
             SELECT 1 FROM agent_llm_runtime_config
             WHERE singleton = 'active' AND (provider_id = $1 OR fallback_provider_id = $1)
           )`,
        [id],
      );
      deleted = res.rowCount ?? 0;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === '23503') {
        throw Object.assign(new Error('provider is in use by runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'active_provider',
        });
      }
      throw err;
    }
    if (deleted === 0) {
      const existing = await pool.query(`SELECT id FROM agent_llm_providers WHERE id = $1`, [id]);
      if ((existing.rowCount ?? 0) === 0) return;
      const rt = await pool.query(
        `SELECT provider_id, fallback_provider_id FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      const reason =
        row?.['provider_id'] === id
          ? 'active_provider'
          : row?.['fallback_provider_id'] === id
            ? 'fallback_provider'
            : 'runtime_in_use';
      throw Object.assign(new Error('provider is runtime in use'), {
        statusCode: 409,
        code: 'agent.runtime_in_use',
        reason,
      });
    }
  },

  async setModelEnabled(id, enabled) {
    // Atomic: same single-statement guard pattern as providers.
    const res = await pool.query(
      `UPDATE agent_llm_models
       SET enabled = $2
       WHERE id = $1
         AND ($2 = true OR NOT EXISTS (
           SELECT 1 FROM agent_llm_runtime_config
           WHERE singleton = 'active' AND (model_id = $1 OR fallback_model_id = $1)
         ))
       RETURNING id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at`,
      [id, enabled],
    );
    if (res.rowCount === 0) {
      const existing = await pool.query(`SELECT id FROM agent_llm_models WHERE id = $1`, [id]);
      if ((existing.rowCount ?? 0) === 0) {
        throw Object.assign(new Error(`model ${id} not found`), { statusCode: 404 });
      }
      const rt = await pool.query(
        `SELECT model_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      const reason =
        row?.['model_id'] === id
          ? 'active_model'
          : row?.['fallback_model_id'] === id
            ? 'fallback_model'
            : 'runtime_in_use';
      throw Object.assign(new Error('model is runtime in use'), {
        statusCode: 409,
        code: 'agent.runtime_in_use',
        reason,
      });
    }
    const r = res.rows[0] as Record<string, unknown>;
    return {
      id: r['id'] as string,
      providerId: r['provider_id'] as string,
      modelId: r['model_id'] as string,
      protocol: r['protocol'] as LlmModel['protocol'],
      privacyClass: r['privacy_class'] as LlmModel['privacyClass'],
      retention: (r['retention'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
    };
  },

  async upsertModel(input) {
    const id = input.id ?? `${input.providerId}:${input.modelId}`;
    const enabled = input.enabled ?? false;
    // Fase 1b-FIX item 1: ON CONFLICT preserves the existing `enabled`
    // (see upsertProvider); new rows default to disabled.
    const res = await pool.query(
      `INSERT INTO agent_llm_models (id, provider_id, model_id, protocol, privacy_class, retention, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (provider_id, model_id) DO UPDATE
       SET protocol = EXCLUDED.protocol,
           privacy_class = EXCLUDED.privacy_class,
           retention = EXCLUDED.retention
       RETURNING id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at`,
      [id, input.providerId, input.modelId, input.protocol, input.privacyClass, input.retention ?? null, enabled],
    );
    const r = res.rows[0] as Record<string, unknown>;
    return {
      id: r['id'] as string,
      providerId: r['provider_id'] as string,
      modelId: r['model_id'] as string,
      protocol: r['protocol'] as LlmModel['protocol'],
      privacyClass: r['privacy_class'] as LlmModel['privacyClass'],
      retention: (r['retention'] as string) ?? null,
      enabled: r['enabled'] as boolean,
      createdAt: r['created_at'] ? String(r['created_at']) : undefined,
    };
  },

  async deleteModel(id: string) {
    const res = await pool.query(
      `DELETE FROM agent_llm_models
       WHERE id = $1
         AND NOT EXISTS (
           SELECT 1 FROM agent_llm_runtime_config
           WHERE singleton = 'active' AND (model_id = $1 OR fallback_model_id = $1)
         )`,
      [id],
    );
    if ((res.rowCount ?? 0) === 0) {
      const existing = await pool.query(`SELECT id FROM agent_llm_models WHERE id = $1`, [id]);
      if ((existing.rowCount ?? 0) === 0) return;
      const rt = await pool.query(
        `SELECT model_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      const reason =
        row?.['model_id'] === id
          ? 'active_model'
          : row?.['fallback_model_id'] === id
            ? 'fallback_model'
            : 'runtime_in_use';
      throw Object.assign(new Error('model is runtime in use'), {
        statusCode: 409,
        code: 'agent.runtime_in_use',
        reason,
      });
    }
  },

  async bumpSecurityEpoch(updatedBy?: string) {
    const res = await pool.query(
      `UPDATE agent_llm_runtime_config
       SET security_epoch = security_epoch + 1,
           version = version + 1,
           updated_at = NOW(),
           updated_by = COALESCE($1, updated_by)
       WHERE singleton = 'active'
       RETURNING singleton, provider_id, model_id, rollout_mode, canary_allowlist, security_epoch, version, updated_at, updated_by`,
      [updatedBy ?? null],
    );
    const r = res.rows[0] as Record<string, unknown>;
    return {
      singleton: 'active',
      providerId: (r['provider_id'] as string) ?? null,
      modelId: (r['model_id'] as string) ?? null,
      rolloutMode: r['rollout_mode'] as RuntimeConfig['rolloutMode'],
      canaryAllowlist: (r['canary_allowlist'] as string[]) ?? [],
      securityEpoch: Number(r['security_epoch']),
      version: Number(r['version']),
      updatedAt: String(r['updated_at']),
      updatedBy: (r['updated_by'] as string) ?? null,
    };
  },
});

export const createInMemoryLlmConfigStore = (seed?: {
  providers?: LlmProvider[];
  models?: LlmModel[];
  runtime?: Partial<RuntimeConfig>;
}): LlmConfigStore => {
  let providers: LlmProvider[] = seed?.providers ? [...seed.providers] : [
    {
      id: 'opencode-zen',
      kind: 'opencode-zen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_ZEN_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'opencode-go',
      kind: 'opencode-go',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENCODE_GO_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'openai-api',
      kind: 'openai-api',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENAI_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'openai-codex-subscription',
      kind: 'openai-codex-subscription',
      transport: 'private-broker',
      authMode: 'chatgpt-browser',
      secretAlias: null,
      enabled: false,
      eligibility: 'experimental_blocked',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'anthropic',
      kind: 'anthropic',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'ANTHROPIC_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'deepseek',
      kind: 'deepseek',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'DEEPSEEK_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'qwen',
      kind: 'qwen',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'QWEN_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'glm',
      kind: 'glm',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'GLM_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'minimax',
      kind: 'minimax',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'MINIMAX_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
    {
      id: 'openrouter',
      kind: 'openrouter',
      transport: 'direct',
      authMode: 'api-key',
      secretAlias: 'OPENROUTER_API_KEY',
      enabled: false,
      eligibility: 'approved',
      runtimeStatus: 'not_configured',
    },
  ];

  let models: LlmModel[] = seed?.models ? [...seed.models] : [];
  let runtime: RuntimeConfig = {
    singleton: 'active',
    providerId: null,
    modelId: null,
    rolloutMode: 'disabled',
    canaryAllowlist: [],
    securityEpoch: 1,
    version: 1,
    ...seed?.runtime,
  };

  return {
    async listProviders() {
      return providers.map((p) => ({ ...p }));
    },
    async getProvider(id: string) {
      const p = providers.find((x) => x.id === id);
      return p ? { ...p } : null;
    },
    async upsertProvider(input) {
      const existingIdx = providers.findIndex((p) => p.id === input.id);
      const existing = existingIdx >= 0 ? providers[existingIdx]! : undefined;
      const provider: LlmProvider = {
        id: input.id,
        kind: input.kind,
        transport: input.transport,
        authMode: input.authMode,
        secretAlias: input.secretAlias,
        // Fase 1b-FIX item 1: preserve existing `enabled` on conflict.
        enabled: existing?.enabled ?? input.enabled ?? false,
        eligibility: input.eligibility ?? 'approved',
        runtimeStatus: input.runtimeStatus ?? 'not_configured',
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) providers[existingIdx] = provider;
      else providers.push(provider);
      return { ...provider };
    },
    async deleteProvider(id: string) {
      if (runtime.providerId === id) {
        throw Object.assign(new Error('provider is active runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'active_provider',
        });
      }
      if (runtime.fallbackProviderId === id) {
        throw Object.assign(new Error('provider is fallback runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'fallback_provider',
        });
      }
      providers = providers.filter((p) => p.id !== id);
      models = models.filter((m) => m.providerId !== id);
    },
    async listModels() {
      return models.map((m) => ({ ...m }));
    },
    async getModel(id: string) {
      const m = models.find((x) => x.id === id);
      return m ? { ...m } : null;
    },
    async getRuntime() {
      return { ...runtime, canaryAllowlist: [...runtime.canaryAllowlist] };
    },
    async updateRuntime(input) {
      if (runtime.version !== input.expectedVersion) {
        throw Object.assign(new Error('version conflict'), {
          statusCode: 409,
          code: 'agent.version_conflict',
        });
      }
      runtime = {
        ...runtime,
        providerId: input.providerId,
        modelId: input.modelId,
        ...(input.fallbackProviderId !== undefined ? { fallbackProviderId: input.fallbackProviderId } : {}),
        ...(input.fallbackModelId !== undefined ? { fallbackModelId: input.fallbackModelId } : {}),
        rolloutMode: input.rolloutMode ?? runtime.rolloutMode,
        canaryAllowlist: input.canaryAllowlist ? [...input.canaryAllowlist] : runtime.canaryAllowlist,
        version: runtime.version + 1,
        updatedBy: input.updatedBy,
        updatedAt: new Date().toISOString(),
      };
      return { ...runtime, canaryAllowlist: [...runtime.canaryAllowlist] };
    },
    async setProviderEnabled(id, enabled) {
      const p = providers.find((x) => x.id === id);
      if (!p) throw Object.assign(new Error(`provider ${id} not found`), { statusCode: 404 });
      if (!enabled) {
        if (runtime.providerId === id) {
          throw Object.assign(new Error('provider is active runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'active_provider',
          });
        }
        if (runtime.fallbackProviderId === id) {
          throw Object.assign(new Error('provider is fallback runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'fallback_provider',
          });
        }
      }
      p.enabled = enabled;
      p.updatedAt = new Date().toISOString();
      return { ...p };
    },
    async setProviderRuntimeStatus(id, status) {
      const p = providers.find((x) => x.id === id);
      if (!p) throw Object.assign(new Error(`provider ${id} not found`), { statusCode: 404 });
      p.runtimeStatus = status;
      p.updatedAt = new Date().toISOString();
      return { ...p };
    },
    async setModelEnabled(id, enabled) {
      const m = models.find((x) => x.id === id);
      if (!m) throw Object.assign(new Error(`model ${id} not found`), { statusCode: 404 });
      if (!enabled) {
        if (runtime.modelId === id) {
          throw Object.assign(new Error('model is active runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'active_model',
          });
        }
        if (runtime.fallbackModelId === id) {
          throw Object.assign(new Error('model is fallback runtime'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: 'fallback_model',
          });
        }
      }
      m.enabled = enabled;
      return { ...m };
    },
    async upsertModel(input) {
      const id = input.id ?? `${input.providerId}:${input.modelId}`;
      const existingIdx = models.findIndex(
        (m) => m.id === id || (m.providerId === input.providerId && m.modelId === input.modelId),
      );
      const existingModel = existingIdx >= 0 ? models[existingIdx]! : undefined;
      const model: LlmModel = {
        id,
        providerId: input.providerId,
        modelId: input.modelId,
        protocol: input.protocol,
        privacyClass: input.privacyClass,
        retention: input.retention ?? null,
        // Fase 1b-FIX item 1: preserve existing `enabled` on conflict.
        enabled: existingModel?.enabled ?? input.enabled ?? false,
        createdAt: existingModel?.createdAt ?? new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        models[existingIdx] = model;
      } else {
        models.push(model);
      }
      return { ...model };
    },
    async deleteModel(id: string) {
      if (runtime.modelId === id) {
        throw Object.assign(new Error('model is active runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'active_model',
        });
      }
      if (runtime.fallbackModelId === id) {
        throw Object.assign(new Error('model is fallback runtime'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason: 'fallback_model',
        });
      }
      models = models.filter((m) => m.id !== id);
    },
    async bumpSecurityEpoch(updatedBy?: string) {
      runtime = {
        ...runtime,
        securityEpoch: runtime.securityEpoch + 1,
        version: runtime.version + 1,
        updatedBy: updatedBy ?? runtime.updatedBy,
        updatedAt: new Date().toISOString(),
      };
      return { ...runtime, canaryAllowlist: [...runtime.canaryAllowlist] };
    },
  };
};

