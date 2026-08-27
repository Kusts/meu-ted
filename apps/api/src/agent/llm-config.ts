export type ProviderKind = 'opencode-zen' | 'opencode-go' | 'openai-api' | 'openai-codex-subscription';
export type Transport = 'direct' | 'private-broker';
export type AuthMode = 'api-key' | 'chatgpt-browser';
export type Protocol = 'responses' | 'messages' | 'chat-completions' | 'google-generative-ai';
export type Eligibility = 'experimental_blocked' | 'approved';
export type RuntimeStatus = 'not_configured' | 'ready' | 'reauth_required' | 'unavailable';
export type RolloutMode = 'disabled' | 'canary' | 'all';
export type PrivacyClass = 'training_prohibited' | 'training_allowed';

export const ALLOWED_KINDS: readonly ProviderKind[] = [
  'opencode-zen',
  'opencode-go',
  'openai-api',
  'openai-codex-subscription',
] as const;

export const ALLOWED_SECRET_ALIASES = [
  'OPENCODE_ZEN_API_KEY',
  'OPENCODE_GO_API_KEY',
  'OPENAI_API_KEY',
] as const;
export type SecretAlias = typeof ALLOWED_SECRET_ALIASES[number];

export const ALLOWED_PROTOCOLS: readonly Protocol[] = [
  'responses',
  'messages',
  'chat-completions',
  'google-generative-ai',
] as const;

export const ALLOWED_ROLLOUT_MODES: readonly RolloutMode[] = [
  'disabled',
  'canary',
  'all',
] as const;

export const ALLOWED_PRIVACY_CLASSES: readonly PrivacyClass[] = [
  'training_prohibited',
  'training_allowed',
] as const;

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
  if (!provider.enabled) return 'provider is disabled';
  if (!model.enabled) return 'model is disabled';
  if (model.privacyClass === 'training_allowed') return 'model with training_allowed is blocked';
  if (!ALLOWED_PROTOCOLS.includes(model.protocol)) return 'invalid model protocol';
  return null;
};
