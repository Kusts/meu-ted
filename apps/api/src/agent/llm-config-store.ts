import type {
  LlmModel,
  LlmProvider,
  PrivacyClass,
  Protocol,
  RuntimeConfig,
  RuntimeStatus,
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
  /**
   * M-08: batch catalog sync with all-or-nothing write semantics (single
   * transaction on Postgres, single-threaded apply in memory). Per-item
   * business conflicts (referenced/immutable/incompatible) are SKIPPED with
   * a deterministic reason — never half-applied, never silent. Unexpected
   * errors abort the whole batch (Postgres rolls back).
   */
  syncModels(inputs: Array<{
    id?: string;
    providerId: string;
    modelId: string;
    protocol: Protocol;
    privacyClass: PrivacyClass;
    retention?: string | null;
    enabled?: boolean;
  }>): Promise<{
    synced: number;
    skipped: Array<{ providerId: string; modelId: string; reason: string }>;
  }>;
};

/** Shared store error shape for revalidation rejections (both backends). */
export const activationBlocked = (reason: string) =>
  Object.assign(new Error(reason), { statusCode: 422, code: 'agent.activation_blocked', reason });

/**
 * M-08: per-item sync conflicts that SKIP (deterministic report) instead of
 * aborting the batch. Anything else is unexpected and aborts everything.
 */
const SYNC_SKIP_CODES = new Set([
  'agent.runtime_in_use',
  'agent.invalid_model',
  'agent.invalid_provider',
  'agent.kind_unsupported',
  'agent.activation_blocked',
]);

export const isSyncSkippable = (err: unknown): boolean => {
  const code = (err as { code?: unknown })?.code;
  return typeof code === 'string' && SYNC_SKIP_CODES.has(code);
};

export const syncSkipReason = (err: unknown): string =>
  (err as { reason?: unknown; message?: unknown })?.reason as string ??
  (err as Error)?.message ??
  'sync conflict';
