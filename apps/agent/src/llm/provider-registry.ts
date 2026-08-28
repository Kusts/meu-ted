export const FIXED_ENDPOINTS: Record<string, string> = {
  'opencode-zen': 'https://opencode.ai/zen/v1',
  'opencode-go': 'https://opencode.ai/zen/go/v1',
  'openai-api': 'https://api.openai.com/v1',
};

export const ALLOWLISTED_SECRETS = [
  'OPENCODE_ZEN_API_KEY',
  'OPENCODE_GO_API_KEY',
  'OPENAI_API_KEY',
] as const;

export type SecretAlias = typeof ALLOWLISTED_SECRETS[number];
export type Protocol = 'responses' | 'messages' | 'chat-completions' | 'google-generative-ai';

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
