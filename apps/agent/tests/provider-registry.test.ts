import { describe, expect, it } from 'vitest';
import {
  FIXED_ENDPOINTS,
  getProviderEndpoint,
  resolveSecret,
  validateModelId,
} from '../src/llm/provider-registry.js';

describe('Provider Registry & Protocol (Task 5)', () => {
  it('maps providers to fixed authoritative endpoints', () => {
    expect(getProviderEndpoint('opencode-zen')).toBe('https://opencode.ai/zen/v1');
    expect(getProviderEndpoint('opencode-go')).toBe('https://opencode.ai/zen/go/v1');
    expect(getProviderEndpoint('openai-api')).toBe('https://api.openai.com/v1');
    expect(() => getProviderEndpoint('untrusted-provider')).toThrow(/unknown or unconfigured provider/);
  });

  it('resolves only allowlisted secret aliases', () => {
    const fakeEnv = {
      OPENCODE_ZEN_API_KEY: 'zen-key-123',
      OPENCODE_GO_API_KEY: 'go-key-456',
      OPENAI_API_KEY: 'openai-key-789',
      SECRET_DB_PASSWORD: 'leak-attempt',
    };

    expect(resolveSecret('OPENCODE_ZEN_API_KEY', fakeEnv)).toBe('zen-key-123');
    expect(resolveSecret('OPENCODE_GO_API_KEY', fakeEnv)).toBe('go-key-456');
    expect(resolveSecret('OPENAI_API_KEY', fakeEnv)).toBe('openai-key-789');
    expect(resolveSecret(null, fakeEnv)).toBeUndefined();
    expect(resolveSecret(undefined, fakeEnv)).toBeUndefined();

    // Disallowed alias throws
    expect(() => resolveSecret('SECRET_DB_PASSWORD', fakeEnv)).toThrow(/invalid secret alias/);
    expect(() => resolveSecret('AWS_SECRET_ACCESS_KEY', fakeEnv)).toThrow(/invalid secret alias/);
  });

  it('validates clean model IDs and rejects path traversal, url queries and slashes', () => {
    expect(validateModelId('gpt-4o')).toBe('gpt-4o');
    expect(validateModelId('gpt-4o-mini')).toBe('gpt-4o-mini');
    expect(validateModelId('claude-3-5-sonnet-20241022')).toBe('claude-3-5-sonnet-20241022');
    expect(validateModelId('deepseek-r1')).toBe('deepseek-r1');

    // Slashes, path traversal, queries, encoding
    expect(() => validateModelId('gpt-4o/v2')).toThrow(/disallowed characters/);
    expect(() => validateModelId('gpt-4o%2fv2')).toThrow(/disallowed characters/);
    expect(() => validateModelId('gpt-4o?query=1')).toThrow(/disallowed characters/);
    expect(() => validateModelId('model@latest')).toThrow(/disallowed characters/);
    expect(() => validateModelId('model#anchor')).toThrow(/disallowed characters/);
    expect(() => validateModelId('../../../etc/passwd')).toThrow(/disallowed characters/);
    expect(() => validateModelId('')).toThrow(/non-empty/);
  });
});
