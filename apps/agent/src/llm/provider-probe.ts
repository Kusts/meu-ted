import {
  FIXED_ENDPOINTS,
  resolveSecret,
  validateModelId,
  type SecretAlias,
} from './provider-registry.js';
import { createSafeFetch } from './model-factory.js';

export type ProbeResult = {
  ready: boolean;
  provider: string;
  model: string;
  transport: string;
  authMode: string;
  latencyMs: number;
  code: string;
};

const PROVIDER_SECRET_MAP: Record<string, SecretAlias> = {
  'opencode-zen': 'OPENCODE_ZEN_API_KEY',
  'opencode-go': 'OPENCODE_GO_API_KEY',
  'openai-api': 'OPENAI_API_KEY',
};

export const probeProvider = async (
  providerKind: string,
  rawModelId: string,
  env: Record<string, string | undefined>,
  customFetch = fetch,
): Promise<ProbeResult> => {
  const start = Date.now();
  let modelId = rawModelId;
  try {
    modelId = validateModelId(rawModelId);
  } catch {
    return {
      ready: false,
      provider: providerKind,
      model: rawModelId,
      transport: 'direct',
      authMode: 'api-key',
      latencyMs: 0,
      code: 'invalid_model_id',
    };
  }

  const baseUrl = FIXED_ENDPOINTS[providerKind];
  if (!baseUrl) {
    return {
      ready: false,
      provider: providerKind,
      model: modelId,
      transport: 'direct',
      authMode: 'api-key',
      latencyMs: 0,
      code: 'unknown_provider',
    };
  }

  const alias = PROVIDER_SECRET_MAP[providerKind];
  if (!alias) {
    return {
      ready: false,
      provider: providerKind,
      model: modelId,
      transport: 'direct',
      authMode: 'api-key',
      latencyMs: 0,
      code: 'unmapped_secret_alias',
    };
  }

  let apiKey: string | undefined;
  try {
    apiKey = resolveSecret(alias, env);
  } catch {
    return {
      ready: false,
      provider: providerKind,
      model: modelId,
      transport: 'direct',
      authMode: 'api-key',
      latencyMs: 0,
      code: 'disallowed_secret_alias',
    };
  }

  if (!apiKey || apiKey.trim() === '') {
    return {
      ready: false,
      provider: providerKind,
      model: modelId,
      transport: 'direct',
      authMode: 'api-key',
      latencyMs: 0,
      code: 'missing_secret',
    };
  }

  const safeFetch = createSafeFetch(customFetch);
  const probeUrl = `${baseUrl}/models`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await safeFetch(probeUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const latencyMs = Date.now() - start;

    if (res.ok) {
      return {
        ready: true,
        provider: providerKind,
        model: modelId,
        transport: 'direct',
        authMode: 'api-key',
        latencyMs,
        code: 'ok',
      };
    }

    return {
      ready: false,
      provider: providerKind,
      model: modelId,
      transport: 'direct',
      authMode: 'api-key',
      latencyMs,
      code: `http_${res.status}`,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isAbort = (err as { name?: string })?.name === 'AbortError';
    return {
      ready: false,
      provider: providerKind,
      model: modelId,
      transport: 'direct',
      authMode: 'api-key',
      latencyMs,
      code: isAbort ? 'timeout' : 'network_error',
    };
  }
};
