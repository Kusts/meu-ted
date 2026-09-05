import type { AdminRuntimeDto, InternalRuntimeDto } from '@pi-finance/llm-contracts';
import type { LlmModel, RuntimeConfig } from './llm-config.js';

/**
 * Single place that publishes the explicit runtime contract.
 * `active*` names are the contract — never export raw RuntimeConfig
 * (`providerId`/`modelId`/`rolloutMode`) to admin or internal consumers.
 */
export const toAdminRuntimeDto = (runtime: RuntimeConfig, models?: LlmModel[]): AdminRuntimeDto => {
  const activeModel = runtime.modelId ? models?.find((m) => m.id === runtime.modelId) ?? null : null;
  const dto: AdminRuntimeDto = {
    singleton: 'active',
    version: runtime.version,
    securityEpoch: runtime.securityEpoch,
    activeProviderId: runtime.providerId,
    activeModelId: runtime.modelId,
    activeProtocol: activeModel?.protocol ?? null,
    activeRolloutPercentage: runtime.rolloutMode === 'all' ? 100 : 0,
    activeRolloutMode: runtime.rolloutMode,
    canaryAllowlist: [...runtime.canaryAllowlist],
    fallbackProviderId: runtime.fallbackProviderId ?? null,
    fallbackModelId: runtime.fallbackModelId ?? null,
    updatedBy: runtime.updatedBy ?? null,
  };
  if (runtime.updatedAt !== undefined) {
    dto.updatedAt = runtime.updatedAt;
  }
  return dto;
};

/** Internal snapshot reuses the same DTO shape (separate function for future divergence). */
export const toInternalRuntimeDto = (runtime: RuntimeConfig, models?: LlmModel[]): InternalRuntimeDto =>
  toAdminRuntimeDto(runtime, models);
