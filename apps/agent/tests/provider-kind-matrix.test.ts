import { describe, expect, it, vi } from 'vitest';
import { KIND_SECRET_ALIASES } from '@pi-finance/llm-contracts/types';
import {
  FIXED_ENDPOINTS,
  REGISTRY_UNSUPPORTED_KINDS,
  getProviderEndpoint,
} from '../src/llm/provider-registry.js';
import { createLanguageModel } from '../src/llm/model-factory.js';
import { probeProvider } from '../src/llm/provider-probe.js';

const EXPECTED_ENDPOINTS: Record<string, string> = {
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

const CHAT_COMPAT_MODELS: Record<string, string> = {
  'opencode-zen': 'zen-1',
  'opencode-go': 'go-1',
  'openai-api': 'gpt-4o-mini',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  qwen: 'qwen-max',
  glm: 'glm-4',
  minimax: 'minimax-text-01',
  // Real OpenRouter `owner/model` shape (Fase 1b-FIX item 8).
  openrouter: 'meta-llama/llama-3-8b',
};

describe('Provider kind matrix — executable end to end (Fase 1b RED)', () => {
  it('exposes a fixed endpoint for every supported kind', () => {
    for (const [kind, baseUrl] of Object.entries(EXPECTED_ENDPOINTS)) {
      expect(getProviderEndpoint(kind)).toBe(baseUrl);
    }
    expect(Object.keys(FIXED_ENDPOINTS).sort()).toEqual(Object.keys(EXPECTED_ENDPOINTS).sort());
  });

  it('maps every supported kind to its contract secret alias', () => {
    for (const kind of Object.keys(EXPECTED_ENDPOINTS)) {
      const aliases = KIND_SECRET_ALIASES[kind as keyof typeof KIND_SECRET_ALIASES];
      expect(aliases.length).toBeGreaterThan(0);
    }
  });

  it('reports missing_secret with a clear message when the secret is absent', async () => {
    for (const kind of Object.keys(EXPECTED_ENDPOINTS)) {
      const modelId = CHAT_COMPAT_MODELS[kind] ?? 'test-model';
      expect(() => createLanguageModel(kind, modelId, 'chat-completions', {})).toThrow(
        /missing required secret/,
      );
      const probed = await probeProvider(kind, modelId, {});
      expect(probed).toMatchObject({ ready: false, code: 'missing_secret' });
    }
  });

  it('creates chat-completions models for every OpenAI-compatible kind', () => {
    for (const [kind, modelId] of Object.entries(CHAT_COMPAT_MODELS)) {
      const aliases = KIND_SECRET_ALIASES[kind as keyof typeof KIND_SECRET_ALIASES];
      const env = { [aliases[0] as string]: `test-key-for-${kind}` };
      const instance = createLanguageModel(kind, modelId, 'chat-completions', env);
      expect(instance.provider).toBe(kind);
      expect(instance.modelId).toBe(modelId);
      expect(instance.model).toBeDefined();
    }
  });

  it('creates an anthropic messages model and a google generative-ai model', () => {
    const anthropicEnv = { ANTHROPIC_API_KEY: 'test-anthropic-key' };
    const anthropic = createLanguageModel('anthropic', 'claude-3-5-sonnet-20241022', 'messages', anthropicEnv);
    expect(anthropic.provider).toBe('anthropic');
    expect(anthropic.model).toBeDefined();

    const googleEnv = { GOOGLE_API_KEY: 'test-google-key' };
    const google = createLanguageModel('google', 'gemini-2.0-flash', 'google-generative-ai', googleEnv);
    expect(google.provider).toBe('google');
    expect(google.model).toBeDefined();
  });

  it('probes OpenAI-spec kinds against their own /models endpoint', async () => {
    for (const [kind, baseUrl] of Object.entries(EXPECTED_ENDPOINTS)) {
      if (kind === 'anthropic' || kind === 'google') continue;
      const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }));
      const modelId = CHAT_COMPAT_MODELS[kind] ?? 'test-model';
      const aliases = KIND_SECRET_ALIASES[kind as keyof typeof KIND_SECRET_ALIASES];
      const result = await probeProvider(
        kind,
        modelId,
        { [aliases[0] as string]: 'test-key-123' },
        fetchMock,
      );
      expect(result.ready).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        `${baseUrl}/models`,
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ authorization: 'Bearer test-key-123' }),
        }),
      );
    }
  });

  it('probes anthropic with x-api-key header instead of OpenAI-spec Bearer /models', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }));
    const result = await probeProvider(
      'anthropic',
      'claude-3-5-sonnet-20241022',
      { ANTHROPIC_API_KEY: 'test-key-123' },
      fetchMock,
    );
    expect(result.ready).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://api.anthropic.com/v1/models');
    expect(init.headers['x-api-key']).toBe('test-key-123');
    expect(init.headers['authorization']).toBeUndefined();
  });

  it('documents openai-codex-subscription as registry-unsupported', () => {
    expect([...REGISTRY_UNSUPPORTED_KINDS]).toContain('openai-codex-subscription');
    expect(() => getProviderEndpoint('openai-codex-subscription')).toThrow(/unknown or unconfigured provider/);
    expect(() => createLanguageModel('openai-codex-subscription', 'codex-mini', 'responses', {})).toThrow();
  });
});
