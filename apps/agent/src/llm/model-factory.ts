import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import {
  FIXED_ENDPOINTS,
  PROVIDER_SECRET_MAP,
  resolveSecret,
  validateModelId,
  type Protocol,
} from './provider-registry.js';
import { normalizeProviderId } from '@pi-finance/llm-contracts/types';

export type ModelInstance = {
  provider: string;
  modelId: string;
  protocol: Protocol;
  model: LanguageModel;
};

const OPENAI_NATIVE_KINDS = new Set(['openai-api', 'openai']);

export const createSafeFetch = (customFetch = fetch): typeof fetch => {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    // Cloudflare Workers does not implement redirect: "error" (it throws
    // "Invalid redirect value"). Use "manual" at the edge and reject any
    // redirect response here — SSRF guard stays, with runtime compatibility.
    const options: RequestInit = {
      ...init,
      redirect: 'manual',
    };
    const response = await customFetch(input, options);
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new TypeError('redirected request rejected by safe fetch');
    }
    return response;
  };
};

export const createLanguageModel = (
  providerKind: string,
  rawModelId: string,
  protocol: Protocol,
  env: Record<string, string | undefined>,
  customFetch = fetch,
): ModelInstance => {
  // H-08: the legacy `openai` alias resolves to the canonical `openai-api`
  // before endpoint/secret resolution — one compat point, no downstream split.
  providerKind = normalizeProviderId(providerKind);
  const modelId = validateModelId(rawModelId);
  const baseUrl = FIXED_ENDPOINTS[providerKind];
  if (!baseUrl) {
    throw new Error(`unknown or unconfigured provider: ${providerKind}`);
  }

  const alias = PROVIDER_SECRET_MAP[providerKind];
  if (!alias) {
    throw new Error(`no secret alias mapped for provider: ${providerKind}`);
  }

  const apiKey = resolveSecret(alias, env);
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(`missing required secret for provider ${providerKind} (${alias})`);
  }

  const safeFetch = createSafeFetch(customFetch);

  let model: LanguageModel;

  switch (protocol) {
    case 'chat-completions': {
      if (OPENAI_NATIVE_KINDS.has(providerKind)) {
        const openai = createOpenAI({
          baseURL: baseUrl,
          apiKey,
          fetch: safeFetch,
        });
        model = openai(modelId);
      } else {
        const compatible = createOpenAICompatible({
          name: providerKind,
          baseURL: baseUrl,
          apiKey,
          fetch: safeFetch,
        });
        model = compatible(modelId);
      }
      break;
    }
    case 'messages': {
      const anthropic = createAnthropic({
        baseURL: baseUrl,
        apiKey,
        fetch: safeFetch,
      });
      model = anthropic(modelId);
      break;
    }
    case 'google-generative-ai': {
      const google = createGoogleGenerativeAI({
        baseURL: baseUrl,
        apiKey,
        fetch: safeFetch,
      });
      model = google(modelId);
      break;
    }
    case 'responses':
    default: {
      const openai = createOpenAI({
        baseURL: baseUrl,
        apiKey,
        fetch: safeFetch,
      });
      model = openai(modelId);
      break;
    }
  }

  return {
    provider: providerKind,
    modelId,
    protocol,
    model,
  };
};
