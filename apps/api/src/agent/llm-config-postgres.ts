import type { Pool } from 'pg';
import { activationBlocked, type LlmConfigStore } from './llm-config-store.js';
import { mapModelRow, mapProviderRow, mapRuntimeRow, emptyRuntime, type DbRow } from './llm-config-row-mapper.js';
import {
  isKindExecutable,
  isProtocolCompatibleWithKind,
  validateProvider,
  validateRuntimePair,
  type LlmModel,
  type LlmProvider,
} from './llm-config.js';

type QueryClient = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: DbRow[]; rowCount: number | null }>;
};

/**
 * Fase 1b-FIX item 6: revalidates one runtime pair against live rows.
 * No row locks here: every writer takes the runtime row FOR UPDATE first
 * (updateRuntime explicitly; toggles/deletes via the rt CTE below), so by
 * the time this runs inside updateRuntime's tx, no concurrent toggle can
 * commit a conflicting change — it blocks on the runtime row instead.
 */
const revalidatePair = async (
  client: QueryClient,
  providerId: string | null,
  modelId: string | null,
): Promise<string | null> => {
  if (providerId === null && modelId === null) return null;
  const [pRes, mRes] = await Promise.all([
    client.query(
      `SELECT id, kind, transport, auth_mode, secret_alias, enabled, eligibility, runtime_status
       FROM agent_llm_providers WHERE id = $1`,
      [providerId],
    ),
    client.query(
      `SELECT id, provider_id, model_id, protocol, privacy_class, enabled
       FROM agent_llm_models WHERE id = $1`,
      [modelId],
    ),
  ]);
  const p = pRes.rows[0];
  const m = mRes.rows[0];
  return validateRuntimePair(
    p
      ? {
          id: p['id'] as string,
          kind: p['kind'] as LlmProvider['kind'],
          transport: p['transport'] as LlmProvider['transport'],
          authMode: p['auth_mode'] as LlmProvider['authMode'],
          secretAlias: (p['secret_alias'] as LlmProvider['secretAlias']) ?? null,
          enabled: p['enabled'] as boolean,
          eligibility: p['eligibility'] as LlmProvider['eligibility'],
          runtimeStatus: p['runtime_status'] as LlmProvider['runtimeStatus'],
        }
      : null,
    m
      ? {
          id: m['id'] as string,
          providerId: m['provider_id'] as string,
          modelId: m['model_id'] as string,
          protocol: m['protocol'] as LlmModel['protocol'],
          privacyClass: m['privacy_class'] as LlmModel['privacyClass'],
          enabled: m['enabled'] as boolean,
        }
      : null,
  );
};

export const createPostgresLlmConfigStore = (pool: Pool): LlmConfigStore => ({
  async listProviders() {
    const res = await pool.query(
      `SELECT id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by
       FROM agent_llm_providers ORDER BY id`,
    );
    return res.rows.map((r) => mapProviderRow(r as DbRow));
  },

  async getProvider(id: string) {
    const res = await pool.query(
      `SELECT id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by
       FROM agent_llm_providers WHERE id = $1`,
      [id],
    );
    if (res.rowCount === 0) return null;
    return mapProviderRow(res.rows[0] as DbRow);
  },

  async listModels() {
    const res = await pool.query(
      `SELECT id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at
       FROM agent_llm_models ORDER BY provider_id, model_id`,
    );
    return res.rows.map((r) => mapModelRow(r as DbRow));
  },

  async getModel(id: string) {
    const res = await pool.query(
      `SELECT id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at
       FROM agent_llm_models WHERE id = $1`,
      [id],
    );
    if (res.rowCount === 0) return null;
    return mapModelRow(res.rows[0] as DbRow);
  },

  async getRuntime() {
    try {
      const res = await pool.query(
        `SELECT singleton, provider_id, model_id, fallback_provider_id, fallback_model_id, rollout_mode, canary_allowlist, security_epoch, version, updated_at, updated_by
         FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const r = res.rows[0] as Record<string, unknown> | undefined;
      if (!r) return emptyRuntime();
      return mapRuntimeRow(r);
    } catch {
      const res = await pool.query(
        `SELECT singleton, provider_id, model_id, rollout_mode, canary_allowlist, security_epoch, version, updated_at, updated_by
         FROM agent_llm_runtime_config WHERE singleton = 'active'`,
      );
      const r = res.rows[0] as Record<string, unknown> | undefined;
      if (!r) return emptyRuntime();
      return mapRuntimeRow(r);
    }
  },

  async updateRuntime(input) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT version, provider_id, model_id, fallback_provider_id, fallback_model_id
         FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      if (cur.rowCount === 0) {
        throw Object.assign(new Error('runtime config row missing'), { statusCode: 500 });
      }
      const stored = cur.rows[0] as Record<string, unknown>;
      const version = Number(stored['version']);
      if (version !== input.expectedVersion) {
        throw Object.assign(new Error('version conflict'), {
          statusCode: 409,
          code: 'agent.version_conflict',
        });
      }
      // Fase 1b-FIX item 6: revalidate every effective pair under the
      // runtime lock. A target disabled/removed between the route check and
      // this commit is rejected here without mutating anything.
      const activeErr = await revalidatePair(client, input.providerId, input.modelId);
      if (activeErr) throw activationBlocked(activeErr);
      const effectiveFallbackProviderId =
        input.fallbackProviderId !== undefined
          ? input.fallbackProviderId
          : ((stored['fallback_provider_id'] as string) ?? null);
      const effectiveFallbackModelId =
        input.fallbackModelId !== undefined ? input.fallbackModelId : ((stored['fallback_model_id'] as string) ?? null);
      const fallbackErr = await revalidatePair(client, effectiveFallbackProviderId, effectiveFallbackModelId);
      if (fallbackErr) throw activationBlocked(fallbackErr);
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
      return mapRuntimeRow(r);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async setProviderEnabled(id, enabled) {
    // Serialized with updateRuntime: the runtime row FOR UPDATE lock is
    // taken first inside an explicit tx, so the guard decision and the
    // write observe every concurrent activation in a total order.
    const client = await pool.connect();
    let res: { rowCount: number | null; rows: Record<string, unknown>[] };
    try {
      await client.query('BEGIN');
      const rt = await client.query(
        `SELECT provider_id, fallback_provider_id FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      if (!enabled) {
        const reason =
          row?.['provider_id'] === id
            ? 'active_provider'
            : row?.['fallback_provider_id'] === id
              ? 'fallback_provider'
              : null;
        if (reason) {
          throw Object.assign(new Error('provider is runtime in use'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason,
          });
        }
      }
      res = await client.query(
        `UPDATE agent_llm_providers
         SET enabled = $2, updated_at = NOW()
         WHERE id = $1
         RETURNING id, kind, transport, auth_mode, secret_alias, service_alias, enabled, eligibility, runtime_status, created_at, updated_at, updated_by`,
        [id, enabled],
      );
      if (res.rowCount === 0) {
        throw Object.assign(new Error(`provider ${id} not found`), { statusCode: 404 });
      }
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Best effort: the transaction may already be aborted.
      }
      throw e;
    } finally {
      client.release();
    }
    return mapProviderRow(res.rows[0] as DbRow);
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
    return mapProviderRow(res.rows[0] as DbRow);
  },

  async upsertProvider(input) {
    // Fase 1b-FIX item 1: ON CONFLICT never touches `enabled` — an upsert
    // (create route, sync) must not disable an active/fallback provider
    // outside the guarded toggle path. New rows still default to disabled.
    // Fase 2 item 6: metadata of a referenced item is revalidated under the
    // runtime lock before writing.
    const client = await pool.connect();
    let res: { rowCount: number | null; rows: Record<string, unknown>[] };
    try {
      await client.query('BEGIN');
      const rt = await client.query(
        `SELECT provider_id, fallback_provider_id FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      const slot =
        row?.['provider_id'] === input.id
          ? 'active_provider'
          : row?.['fallback_provider_id'] === input.id
            ? 'fallback_provider'
            : null;
      if (slot) {
        const cur = await client.query(
          `SELECT kind, transport, auth_mode, secret_alias, eligibility FROM agent_llm_providers WHERE id = $1`,
          [input.id],
        );
        const existing = cur.rows[0] as Record<string, unknown> | undefined;
        if (existing) {
          if (input.kind !== existing['kind'] && !isKindExecutable(input.kind)) {
            throw Object.assign(
              new Error(`provider kind ${input.kind} is not executable by the agent runtime`),
              {
                statusCode: 422,
                code: 'agent.kind_unsupported',
                reason: `provider kind ${input.kind} is not executable by the agent runtime`,
              },
            );
          }
          const merged = {
            kind: input.kind,
            transport: input.transport,
            authMode: input.authMode,
            secretAlias: input.secretAlias,
            eligibility: input.eligibility ?? (existing['eligibility'] as LlmProvider['eligibility']),
          };
          const err = validateProvider(merged);
          if (err) {
            throw Object.assign(new Error(err), {
              statusCode: 422,
              code: 'agent.invalid_provider',
              reason: err,
            });
          }
          if (existing['eligibility'] === 'approved' && merged.eligibility !== 'approved') {
            throw Object.assign(new Error('provider is runtime in use'), {
              statusCode: 409,
              code: 'agent.runtime_in_use',
              reason: slot,
            });
          }
        }
      }
      res = await client.query(
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
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Best effort: the transaction may already be aborted.
      }
      throw e;
    } finally {
      client.release();
    }
    return mapProviderRow(res.rows[0] as DbRow);
  },

  async deleteProvider(id: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rt = await client.query(
        `SELECT provider_id, fallback_provider_id FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      const reason =
        row?.['provider_id'] === id
          ? 'active_provider'
          : row?.['fallback_provider_id'] === id
            ? 'fallback_provider'
            : null;
      if (reason) {
        throw Object.assign(new Error('provider is runtime in use'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason,
        });
      }
      try {
        await client.query(`DELETE FROM agent_llm_providers WHERE id = $1`, [id]);
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
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Best effort: the transaction may already be aborted.
      }
      throw e;
    } finally {
      client.release();
    }
  },

  async setModelEnabled(id, enabled) {
    // Same runtime-first locking protocol as providers.
    const client = await pool.connect();
    let res: { rowCount: number | null; rows: Record<string, unknown>[] };
    try {
      await client.query('BEGIN');
      const rt = await client.query(
        `SELECT model_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      if (!enabled) {
        const reason =
          row?.['model_id'] === id
            ? 'active_model'
            : row?.['fallback_model_id'] === id
              ? 'fallback_model'
              : null;
        if (reason) {
          throw Object.assign(new Error('model is runtime in use'), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason,
          });
        }
      }
      res = await client.query(
        `UPDATE agent_llm_models
         SET enabled = $2
         WHERE id = $1
         RETURNING id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at`,
        [id, enabled],
      );
      if (res.rowCount === 0) {
        throw Object.assign(new Error(`model ${id} not found`), { statusCode: 404 });
      }
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Best effort: the transaction may already be aborted.
      }
      throw e;
    } finally {
      client.release();
    }
    return mapModelRow(res.rows[0] as DbRow);
  },

  async upsertModel(input) {
    const id = input.id ?? `${input.providerId}:${input.modelId}`;
    const enabled = input.enabled ?? false;
    // Fase 1b-FIX item 1: ON CONFLICT preserves the existing `enabled`
    // (see upsertProvider); new rows default to disabled.
    // Fase 2 item 6: protocol/privacyClass of a referenced model are
    // immutable via upsert — revalidated under the runtime lock.
    const client = await pool.connect();
    let res: { rowCount: number | null; rows: Record<string, unknown>[] };
    try {
      await client.query('BEGIN');
      const rt = await client.query(
        `SELECT model_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      // Fase 3 item 2: resolve the referenced row by id OR pair (an upsert
      // may target the referenced row through either key), then enforce
      // identity immutability + kind↔protocol compatibility under the lock.
      const cur = await client.query(
        `SELECT m.id AS id, m.protocol AS protocol, m.privacy_class AS privacy_class,
                m.provider_id AS provider_id, m.model_id AS model_id, p.kind AS provider_kind
         FROM agent_llm_models m LEFT JOIN agent_llm_providers p ON p.id = m.provider_id
         WHERE m.id = $1 OR (m.provider_id = $2 AND m.model_id = $3)
         LIMIT 1`,
        [id, input.providerId, input.modelId],
      );
      const existing = cur.rows[0] as Record<string, unknown> | undefined;
      const slot =
        existing && row?.['model_id'] === existing['id']
          ? 'active_model'
          : existing && row?.['fallback_model_id'] === existing['id']
            ? 'fallback_model'
            : null;
      if (slot && existing) {
        if (
          existing['provider_id'] !== input.providerId ||
          existing['model_id'] !== input.modelId ||
          existing['id'] !== id
        ) {
          const label = slot === 'active_model' ? 'active' : 'fallback';
          const reason = `model identity of the ${label} model is immutable while referenced`;
          throw Object.assign(new Error(reason), {
            statusCode: 409,
            code: 'agent.runtime_in_use',
            reason: slot,
          });
        }
        const kind = existing['provider_kind'];
        if (
          typeof kind === 'string' &&
          !isProtocolCompatibleWithKind(kind, input.protocol)
        ) {
          const reason = `model protocol ${input.protocol} is not compatible with provider kind ${kind}`;
          throw Object.assign(new Error(reason), {
            statusCode: 422,
            code: 'agent.invalid_model',
            reason,
          });
        }
        if (
          existing['protocol'] !== input.protocol ||
          existing['privacy_class'] !== input.privacyClass
        ) {
          const reason = 'protocol/privacyClass of a referenced model is immutable';
          throw Object.assign(new Error(reason), {
            statusCode: 422,
            code: 'agent.invalid_model',
            reason,
          });
        }
      }
      res = await client.query(
        `INSERT INTO agent_llm_models (id, provider_id, model_id, protocol, privacy_class, retention, enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (provider_id, model_id) DO UPDATE
         SET protocol = EXCLUDED.protocol,
             privacy_class = EXCLUDED.privacy_class,
             retention = EXCLUDED.retention
         RETURNING id, provider_id, model_id, protocol, privacy_class, retention, enabled, created_at`,
        [id, input.providerId, input.modelId, input.protocol, input.privacyClass, input.retention ?? null, enabled],
      );
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Best effort: the transaction may already be aborted.
      }
      throw e;
    } finally {
      client.release();
    }
    return mapModelRow(res.rows[0] as DbRow);
  },

  async deleteModel(id: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const rt = await client.query(
        `SELECT model_id, fallback_model_id FROM agent_llm_runtime_config WHERE singleton = 'active' FOR UPDATE`,
      );
      const row = rt.rows[0] as Record<string, unknown> | undefined;
      const reason =
        row?.['model_id'] === id
          ? 'active_model'
          : row?.['fallback_model_id'] === id
            ? 'fallback_model'
            : null;
      if (reason) {
        throw Object.assign(new Error('model is runtime in use'), {
          statusCode: 409,
          code: 'agent.runtime_in_use',
          reason,
        });
      }
      await client.query(`DELETE FROM agent_llm_models WHERE id = $1`, [id]);
      await client.query('COMMIT');
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Best effort: the transaction may already be aborted.
      }
      throw e;
    } finally {
      client.release();
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
    return mapRuntimeRow(res.rows[0] as DbRow);
  },
});




