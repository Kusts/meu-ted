import { describe, expect, it, vi } from 'vitest';
import { createLanguageModel, createSafeFetch } from '../src/llm/model-factory.js';

describe('AI SDK Model Factory (Task 5)', () => {
  it('creates language model instance for openai-api provider', () => {
    const env = {
      OPENAI_API_KEY: 'test-openai-key-12345',
    };

    const instance = createLanguageModel(
      'openai-api',
      'gpt-4o-mini',
      'chat-completions',
      env,
    );

    expect(instance.provider).toBe('openai-api');
    expect(instance.modelId).toBe('gpt-4o-mini');
    expect(instance.protocol).toBe('chat-completions');
    expect(instance.model).toBeDefined();
  });

  it('creates language model instance for opencode-zen provider', () => {
    const env = {
      OPENCODE_ZEN_API_KEY: 'test-zen-key-67890',
    };

    const instance = createLanguageModel(
      'opencode-zen',
      'claude-3-5-sonnet',
      'messages',
      env,
    );

    expect(instance.provider).toBe('opencode-zen');
    expect(instance.modelId).toBe('claude-3-5-sonnet');
    expect(instance.protocol).toBe('messages');
    expect(instance.model).toBeDefined();
  });

  it('throws when secret is missing for provider', () => {
    expect(() =>
      createLanguageModel('openai-api', 'gpt-4o', 'chat-completions', {}),
    ).toThrow(/missing required secret/);
  });

  it('enforces redirect: "error" in safe fetch wrapper', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const safeFetch = createSafeFetch(fetchMock);

    await safeFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        redirect: 'error',
      }),
    );
  });
});
