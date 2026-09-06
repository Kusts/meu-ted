import type { LlmModel, LlmProvider, RuntimeConfig } from './llm-config.js';

export type DbRow = Record<string, unknown>;

/** Maps a agent_llm_providers row to the domain shape. */
export const mapProviderRow = (r: DbRow): LlmProvider => ({
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
});

/** Maps a agent_llm_models row to the domain shape. */
export const mapModelRow = (r: DbRow): LlmModel => ({
  id: r['id'] as string,
  providerId: r['provider_id'] as string,
  modelId: r['model_id'] as string,
  protocol: r['protocol'] as LlmModel['protocol'],
  privacyClass: r['privacy_class'] as LlmModel['privacyClass'],
  retention: (r['retention'] as string) ?? null,
  enabled: r['enabled'] as boolean,
  createdAt: r['created_at'] ? String(r['created_at']) : undefined,
});

/**
 * Maps a agent_llm_runtime_config row to the domain shape. Missing fallback
 * columns (pre-V041 rows) map to null, so the same mapper serves the
 * legacy fallback path.
 */
export const mapRuntimeRow = (r: DbRow): RuntimeConfig => ({
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
});

/** Default runtime when the singleton row is absent. */
export const emptyRuntime = (): RuntimeConfig => ({
  singleton: 'active',
  providerId: null,
  modelId: null,
  fallbackProviderId: null,
  fallbackModelId: null,
  rolloutMode: 'disabled',
  canaryAllowlist: [],
  securityEpoch: 1,
  version: 1,
});
