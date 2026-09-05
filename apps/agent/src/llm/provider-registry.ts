import {
  KIND_SECRET_ALIASES,
  SECRET_ALIASES,
  type ProviderKind,
  type SecretAlias as ContractSecretAlias,
  type Protocol as ContractProtocol,
} from '@pi-finance/llm-contracts/types';

export const FIXED_ENDPOINTS: Record<string, string> = {
  'opencode-zen': 'https://opencode.ai/zen/v1',
  'opencode-go': 'https://opencode.ai/zen/go/v1',
  'openai-api': 'https://api.openai.com/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  glm: 'https://open.bigmodel.cn/api/paas/v4',
  minimax: 'https://api.minimax.chat/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
};

/**
 * Kinds the direct-execution registry intentionally cannot run.
 * `openai-codex-subscription` uses the private-broker transport
 * (chatgpt-browser auth) and has no direct endpoint or secret alias;
 * it stays configured-but-blocked via eligibility, never executable here.
 */
export const REGISTRY_UNSUPPORTED_KINDS = ['openai-codex-subscription'] as const;
export type RegistryUnsupportedKind = (typeof REGISTRY_UNSUPPORTED_KINDS)[number];

export const ALLOWLISTED_SECRETS = SECRET_ALIASES;
export type SecretAlias = ContractSecretAlias;
export type Protocol = ContractProtocol;

/** Single alias per kind, derived from the contract map (no drift by construction). */
export const PROVIDER_SECRET_MAP: Record<string, SecretAlias> = Object.fromEntries(
  (Object.keys(KIND_SECRET_ALIASES) as ProviderKind[]).flatMap((kind) => {
    const first = KIND_SECRET_ALIASES[kind][0];
    return first === undefined ? [] : [[kind, first] as [string, SecretAlias]];
  }),
);

export const resolveSecret = (alias: string | null | undefined, env: Record<string, string | undefined>): string | undefined => {
  if (!alias) return undefined;
  if (!ALLOWLISTED_SECRETS.includes(alias as SecretAlias)) {
    throw new Error(`invalid secret alias: ${alias}. Only allowlisted secrets may be accessed.`);
  }
  return env[alias];
};

export const validateModelId = (modelId: string): string => {
  if (!modelId || typeof modelId !== 'string') {
    throw new Error('model ID must be a non-empty string');
  }
  const trimmed = modelId.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    throw new Error('model ID length must be between 1 and 120 characters');
  }
  // Disallow path traversal, URL query, encoding tricks, slashes or special characters
  if (/[/%?@\\#&:*<>"|]/.test(trimmed)) {
    throw new Error(`model ID contains disallowed characters: ${trimmed}`);
  }
  return trimmed;
};

export const getProviderEndpoint = (providerKind: string): string => {
  const endpoint = FIXED_ENDPOINTS[providerKind];
  if (!endpoint) {
    throw new Error(`unknown or unconfigured provider: ${providerKind}`);
  }
  return endpoint;
};
