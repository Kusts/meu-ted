import {
  AUTH_MODES,
  KIND_SECRET_ALIASES,
  PRIVACY_CLASSES,
  PROTOCOLS,
  PROVIDER_KINDS,
  REGISTRY_UNSUPPORTED_KINDS,
  ROLLOUT_MODES,
  SECRET_ALIASES,
  isProtocolCompatibleWithKind,
  type AuthMode,
  type PrivacyClass,
  type Protocol,
  type ProviderEligibility,
  type ProviderKind,
  type RolloutMode,
  type RuntimeStatus,
  type SecretAlias,
  type Transport,
} from '@pi-finance/llm-contracts';

export type { AuthMode, PrivacyClass, Protocol, ProviderKind, RolloutMode, RuntimeStatus, SecretAlias, Transport };
export type Eligibility = ProviderEligibility;

export const ALLOWED_KINDS: readonly ProviderKind[] = PROVIDER_KINDS;

export const ALLOWED_SECRET_ALIASES = SECRET_ALIASES;

export const ALLOWED_PROTOCOLS: readonly Protocol[] = PROTOCOLS;

export const ALLOWED_ROLLOUT_MODES: readonly RolloutMode[] = ROLLOUT_MODES;

export const ALLOWED_PRIVACY_CLASSES: readonly PrivacyClass[] = PRIVACY_CLASSES;

export { AUTH_MODES, KIND_SECRET_ALIASES, REGISTRY_UNSUPPORTED_KINDS, isProtocolCompatibleWithKind };

export const isKindExecutable = (kind: string): boolean =>
  (PROVIDER_KINDS as readonly string[]).includes(kind) &&
  !(REGISTRY_UNSUPPORTED_KINDS as readonly string[]).includes(kind);

export interface LlmProvider {
  id: string;
  kind: ProviderKind;
  transport: Transport;
  authMode: AuthMode;
  secretAlias: SecretAlias | null;
  serviceAlias?: string | null | undefined;
  enabled: boolean;
  eligibility: Eligibility;
  runtimeStatus: RuntimeStatus;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  updatedBy?: string | null | undefined;
}

export interface LlmModel {
  id: string;
  providerId: string;
  modelId: string;
  protocol: Protocol;
  privacyClass: PrivacyClass;
  retention?: string | null | undefined;
  enabled: boolean;
  createdAt?: string | undefined;
}

export interface RuntimeConfig {
  singleton: 'active';
  providerId: string | null;
  modelId: string | null;
  fallbackProviderId?: string | null;
  fallbackModelId?: string | null;
  rolloutMode: RolloutMode;
  canaryAllowlist: string[];
  securityEpoch: number;
  version: number;
  updatedAt?: string | undefined;
  updatedBy?: string | null | undefined;
}

export const isCompatibleTransportAuth = (transport: Transport, authMode: AuthMode): boolean =>
  (transport === 'direct' && authMode === 'api-key') ||
  (transport === 'private-broker' && authMode === 'chatgpt-browser');

export const validateProvider = (p: Partial<LlmProvider>): string | null => {
  if (!p.kind || !ALLOWED_KINDS.includes(p.kind)) return 'invalid kind';
  if (!p.transport || !p.authMode || !isCompatibleTransportAuth(p.transport, p.authMode)) {
    return 'incompatible transport/auth';
  }
  if (p.kind === 'openai-codex-subscription' && p.secretAlias !== null && p.secretAlias !== undefined) {
    return 'codex must not have secret alias';
  }
  if (p.kind !== 'openai-codex-subscription') {
    if (!p.secretAlias || !ALLOWED_SECRET_ALIASES.includes(p.secretAlias as SecretAlias)) {
      return 'invalid secret alias';
    }
    const kind = p.kind as ProviderKind;
    const allowedForKind = KIND_SECRET_ALIASES[kind];
    if (!allowedForKind.includes(p.secretAlias as SecretAlias)) {
      return `invalid secret alias for kind ${kind}: ${String(p.secretAlias)}`;
    }
  }
  return null;
};

export const validateModel = (m: Partial<LlmModel>): string | null => {
  if (!m.providerId || typeof m.providerId !== 'string' || m.providerId.trim() === '') {
    return 'providerId is required';
  }
  if (!m.modelId || typeof m.modelId !== 'string' || m.modelId.trim() === '') {
    return 'modelId is required';
  }
  if (!m.protocol || !ALLOWED_PROTOCOLS.includes(m.protocol)) {
    return 'invalid protocol';
  }
  if (!m.privacyClass || !ALLOWED_PRIVACY_CLASSES.includes(m.privacyClass)) {
    return 'invalid privacy class';
  }
  return null;
};

export const canActivate = (
  provider: LlmProvider | undefined | null,
  model: LlmModel | undefined | null,
): string | null => {
  if (!provider || !model) return 'provider and model are required';
  if (provider.eligibility !== 'approved') return 'provider is not approved for activation';
  if (!isKindExecutable(provider.kind)) return `provider kind ${provider.kind} is not executable by the agent runtime`;
  if (!provider.enabled) return 'provider is disabled';
  if (!model.enabled) return 'model is disabled';
  if (model.privacyClass === 'training_allowed') return 'model with training_allowed is blocked';
  if (!ALLOWED_PROTOCOLS.includes(model.protocol)) return 'invalid model protocol';
  // Fase 3 R2: semantic kind↔protocol compatibility, after the generic
  // checks so existing reasons (disabled, training_allowed, ...) keep firing first.
  if (!isProtocolCompatibleWithKind(provider.kind, model.protocol)) {
    return `model protocol ${model.protocol} is not compatible with provider kind ${provider.kind}`;
  }
  return null;
};

/**
 * Fase 1b-FIX item 6: validates a runtime pair (active or fallback) as a
 * whole. Both null clears the pair; anything else must resolve to an
 * existing, enabled, approved, executable, correctly-owned pair.
 */
export const validateRuntimePair = (
  provider: LlmProvider | undefined | null,
  model: LlmModel | undefined | null,
): string | null => {
  if (provider === null && model === null) return null;
  if (provider === undefined && model === undefined) return null;
  const err = canActivate(provider ?? undefined, model ?? undefined);
  if (err) return err;
  if (model!.providerId !== provider!.id) return 'model does not belong to provider';
  return null;
};
