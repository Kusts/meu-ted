import { describe, expect, it } from 'vitest';
import { toAdminRuntimeDto, toInternalRuntimeDto } from '../../src/agent/runtime-mapper.js';
import type { LlmModel, RuntimeConfig } from '../../src/agent/llm-config.js';

const baseRuntime: RuntimeConfig = {
  singleton: 'active',
  providerId: 'openai-api',
  modelId: 'openai-api:gpt-4o',
  fallbackProviderId: 'opencode-zen',
  fallbackModelId: 'opencode-zen:zen-1',
  rolloutMode: 'all',
  canaryAllowlist: [],
  securityEpoch: 2,
  version: 3,
  updatedBy: 'admin@test.com',
  updatedAt: '2026-09-05T00:00:00.000Z',
};

const models: LlmModel[] = [
  {
    id: 'openai-api:gpt-4o',
    providerId: 'openai-api',
    modelId: 'gpt-4o',
    protocol: 'chat-completions',
    privacyClass: 'training_prohibited',
    retention: null,
    enabled: true,
  },
];

describe('Runtime mapper — single active* contract (Fase 1a RED)', () => {
  it('toAdminRuntimeDto publishes active* names, never raw providerId/modelId', () => {
    const dto = toAdminRuntimeDto(baseRuntime, models);
    expect(dto.activeProviderId).toBe('openai-api');
    expect(dto.activeModelId).toBe('openai-api:gpt-4o');
    expect(dto.activeProtocol).toBe('chat-completions');
    expect(dto.activeRolloutPercentage).toBe(100);
    expect(dto.activeRolloutMode).toBe('all');
    expect(dto.fallbackProviderId).toBe('opencode-zen');
    expect(dto.fallbackModelId).toBe('opencode-zen:zen-1');
    expect(dto.version).toBe(3);
    expect(dto.securityEpoch).toBe(2);
    expect(dto.updatedBy).toBe('admin@test.com');
    expect(dto).not.toHaveProperty('providerId');
    expect(dto).not.toHaveProperty('modelId');
    expect(dto).not.toHaveProperty('rolloutMode');
  });

  it('maps rolloutMode disabled to 0% and resolves protocol from models', () => {
    const dto = toAdminRuntimeDto({ ...baseRuntime, rolloutMode: 'disabled' }, models);
    expect(dto.activeRolloutPercentage).toBe(0);
    expect(dto.activeRolloutMode).toBe('disabled');
  });

  it('resolves null protocol when the active model is unknown', () => {
    const dto = toAdminRuntimeDto(baseRuntime, []);
    expect(dto.activeProtocol).toBeNull();
  });

  it('toInternalRuntimeDto exposes the same active* contract', () => {
    const dto = toInternalRuntimeDto(baseRuntime, models);
    expect(dto.activeProviderId).toBe('openai-api');
    expect(dto.activeModelId).toBe('openai-api:gpt-4o');
    expect(dto).not.toHaveProperty('providerId');
  });

  it('maps empty runtime to null active fields', () => {
    const dto = toAdminRuntimeDto({
      singleton: 'active',
      providerId: null,
      modelId: null,
      rolloutMode: 'disabled',
      canaryAllowlist: [],
      securityEpoch: 1,
      version: 1,
    });
    expect(dto.activeProviderId).toBeNull();
    expect(dto.activeModelId).toBeNull();
    expect(dto.activeProtocol).toBeNull();
  });
});
