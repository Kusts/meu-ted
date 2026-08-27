import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import {
  FIXED_ENDPOINTS,
  resolveSecret,
  validateModelId,
  type Protocol,
  type SecretAlias,
} from './provider-registry.js';

export type ModelInstance = {
  provider: string;
  modelId: string;
  protocol: Protocol;
  model: LanguageModel;
};

const PROVIDER_SECRET_MAP: Record<string, SecretAlias> = {
  'opencode-zen': 'OPENCODE_ZEN_API_KEY',
  'opencode-go': 'OPENCODE_GO_API_KEY',
  'openai-api': 'OPENAI_API_KEY',
};

export const createSafeFetch = (customFetch = fetch): typeof fetch => {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const options: RequestInit = {
      ...init,
      redirect: 'error',
    };
    return customFetch(input, options);
  };
};

export const createLanguageModel = (
  providerKind: string,
  rawModelId: string,
  protocol: Protocol,
  env: Record<string, string | undefined>,
  customFetch = fetch,
): ModelInstance => {
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
      if (providerKind === 'openai-api') {
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
      const compatible = createOpenAICompatible({
        name: providerKind,
        baseURL: baseUrl,
        apiKey,
        fetch: safeFetch,
      });
      model = compatible(modelId);
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
