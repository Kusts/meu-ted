/**
 * Shared isomorphic LLM governance contracts.
 * Pure types + const enums only. This module MUST NOT import server-side code
 * (no pg, no fastify, no Cloudflare bindings) so API, PWA and Agent can share it.
 */

export const PROVIDER_KINDS = [
  'opencode-zen',
  'opencode-go',
  'openai-api',
  'openai-codex-subscription',
  'openai',
  'anthropic',
  'deepseek',
  'qwen',
  'glm',
  'minimax',
  'google',
  'openrouter',
] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const SECRET_ALIASES = [
  'OPENCODE_ZEN_API_KEY',
  'OPENCODE_GO_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'QWEN_API_KEY',
  'GLM_API_KEY',
  'MINIMAX_API_KEY',
  'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY',
] as const;
export type SecretAlias = (typeof SECRET_ALIASES)[number];

/**
 * Kinds the direct-execution registry intentionally cannot run.
 * Single source shared by the agent registry, the API domain/routes and V042.
 */
export const REGISTRY_UNSUPPORTED_KINDS = ['openai-codex-subscription'] as const;
export type RegistryUnsupportedKind = (typeof REGISTRY_UNSUPPORTED_KINDS)[number];

export const isKindExecutable = (kind: string): kind is Exclude<ProviderKind, RegistryUnsupportedKind> =>
  (PROVIDER_KINDS as readonly string[]).includes(kind) &&
  !(REGISTRY_UNSUPPORTED_KINDS as readonly string[]).includes(kind);

/** Single source: which secret aliases each provider kind may use. */
export const KIND_SECRET_ALIASES: Record<ProviderKind, readonly SecretAlias[]> = {
  'opencode-zen': ['OPENCODE_ZEN_API_KEY'],
  'opencode-go': ['OPENCODE_GO_API_KEY'],
  'openai-api': ['OPENAI_API_KEY'],
  'openai-codex-subscription': [],
  openai: ['OPENAI_API_KEY'],
  anthropic: ['ANTHROPIC_API_KEY'],
  deepseek: ['DEEPSEEK_API_KEY'],
  qwen: ['QWEN_API_KEY'],
  glm: ['GLM_API_KEY'],
  minimax: ['MINIMAX_API_KEY'],
  google: ['GOOGLE_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
};

export const TRANSPORTS = ['direct', 'private-broker'] as const;
export type Transport = (typeof TRANSPORTS)[number];

export const AUTH_MODES = ['api-key', 'chatgpt-browser'] as const;
export type AuthMode = (typeof AUTH_MODES)[number];

export const PROTOCOLS = ['responses', 'messages', 'chat-completions', 'google-generative-ai'] as const;
export type Protocol = (typeof PROTOCOLS)[number];

/** Canonical privacy classes (server enum is the source of truth). */
export const PRIVACY_CLASSES = ['training_prohibited', 'training_allowed'] as const;
export type PrivacyClass = (typeof PRIVACY_CLASSES)[number];

export const ROLLOUT_MODES = ['disabled', 'canary', 'all'] as const;
export type RolloutMode = (typeof ROLLOUT_MODES)[number];

export const PROVIDER_ELIGIBILITIES = ['approved', 'candidate', 'experimental_blocked'] as const;
export type ProviderEligibility = (typeof PROVIDER_ELIGIBILITIES)[number];

export const RUNTIME_STATUSES = ['not_configured', 'ready', 'reauth_required', 'unavailable'] as const;
export type RuntimeStatus = (typeof RUNTIME_STATUSES)[number];

export const isProviderKind = (value: string): value is ProviderKind =>
  (PROVIDER_KINDS as readonly string[]).includes(value);

export const isProtocol = (value: string): value is Protocol =>
  (PROTOCOLS as readonly string[]).includes(value);

/**
 * Single source: which protocols each executable kind can actually run.
 * Derived from the agent model-factory wiring (OpenAI-native vs
 * OpenAI-compatible vs Anthropic messages vs Google generative-ai).
 * Unsupported kinds (codex) have no entry: nothing is compatible with them.
 */
export const KIND_PROTOCOL_COMPAT: Record<
  Exclude<ProviderKind, RegistryUnsupportedKind>,
  readonly Protocol[]
> = {
  'opencode-zen': ['chat-completions', 'responses'],
  'opencode-go': ['chat-completions', 'responses'],
  'openai-api': ['chat-completions', 'responses'],
  openai: ['chat-completions', 'responses'],
  anthropic: ['messages'],
  deepseek: ['chat-completions', 'responses'],
  qwen: ['chat-completions', 'responses'],
  glm: ['chat-completions', 'responses'],
  minimax: ['chat-completions', 'responses'],
  google: ['google-generative-ai'],
  openrouter: ['chat-completions', 'responses'],
};

export const isProtocolCompatibleWithKind = (kind: string, protocol: string): boolean => {
  const list = (KIND_PROTOCOL_COMPAT as Record<string, readonly string[]>)[kind];
  return list !== undefined && list.includes(protocol);
};

/**
 * Explicit admin runtime DTO. field names with the `active` prefix are the
 * contract — consumers MUST NOT read legacy `providerId`/`modelId` names.
 */
export interface AdminRuntimeDto {
  singleton: 'active';
  version: number;
  securityEpoch: number;
  activeProviderId: string | null;
  activeModelId: string | null;
  activeProtocol: Protocol | null;
  activeRolloutPercentage: number;
  activeRolloutMode: RolloutMode;
  canaryAllowlist: string[];
  fallbackProviderId: string | null;
  fallbackModelId: string | null;
  updatedBy: string | null;
  updatedAt?: string;
}

/** Internal snapshot reuses the same runtime DTO shape. */
export type InternalRuntimeDto = AdminRuntimeDto;

export interface LlmProviderSlot {
  id: string;
  kind: ProviderKind;
  transport: Transport;
  authMode: AuthMode;
  secretAlias: SecretAlias | null;
  serviceAlias: string | null;
  eligibility: ProviderEligibility;
}

export interface LlmModelSlot {
  id: string;
  modelId: string;
  protocol: Protocol;
  privacyClass: PrivacyClass;
}

export interface InternalLlmSnapshot {
  runtime: InternalRuntimeDto;
  activeProvider: LlmProviderSlot | null;
  activeModel: LlmModelSlot | null;
  fallbackProvider: LlmProviderSlot | null;
  fallbackModel: LlmModelSlot | null;
  /** True when an active pair is configured but not usable (disabled or missing): fail closed. */
  activeDisabled: boolean;
  /** True when a fallback pair is configured but not usable: fail closed. */
  fallbackDisabled: boolean;
}

/** Agent-side view of the runtime contract (active* names only). */
export interface RuntimeSnapshot {
  version: number;
  securityEpoch: number;
  activeProviderId: string | null;
  activeModelId: string | null;
  activeProtocol: Protocol | null;
  activeRolloutPercentage: number;
  fallbackProviderId: string | null;
  fallbackModelId: string | null;
  /**
   * Bare upstream model id (no `providerId:` prefix), taken from the validated
   * model slot. `activeModelId` is the store row id used for configuration
   * references; the bare name is what the upstream provider API expects.
   * Fase 3 item 5: executing with the row id fails provider-side validation.
   */
  activeModelName: string | null;
  /** Bare upstream model id for the fallback slot (same semantics). */
  fallbackModelName: string | null;
}
