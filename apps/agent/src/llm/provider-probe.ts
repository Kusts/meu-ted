import {
  FIXED_ENDPOINTS,
  PROVIDER_SECRET_MAP,
  resolveSecret,
  validateModelId,
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

/**
 * Health-check target per kind. Only OpenAI-spec protocols expose
 * GET /models with Bearer auth (B-L4): anthropic needs x-api-key plus
 * the version header, google lists models with the key as query param.
 */
const probeTarget = (
  providerKind: string,
  baseUrl: string,
  apiKey: string,
): { url: string; headers: Record<string, string> } => {
  if (providerKind === 'anthropic') {
    return {
      url: `${baseUrl}/models`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        accept: 'application/json',
      },
    };
  }
  if (providerKind === 'google') {
    return {
      url: `${baseUrl}/models?key=${encodeURIComponent(apiKey)}`,
      headers: { accept: 'application/json' },
    };
  }
  return {
    url: `${baseUrl}/models`,
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: 'application/json',
    },
  };
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
  const target = probeTarget(providerKind, baseUrl, apiKey);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await safeFetch(target.url, {
      method: 'GET',
      headers: target.headers,
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
