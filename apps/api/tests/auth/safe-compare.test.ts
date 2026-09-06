import { describe, expect, it } from 'vitest';
import { safeCompareTokens } from '../../src/auth/safe-compare.js';

describe('safeCompareTokens (Fase 3 item 7)', () => {
  it('accepts equal tokens', () => {
    expect(safeCompareTokens('secret-token-123', 'secret-token-123')).toBe(true);
  });

  it('rejects different tokens of the same length', () => {
    expect(safeCompareTokens('secret-token-123', 'secret-token-124')).toBe(false);
  });

  it('rejects tokens of different lengths', () => {
    expect(safeCompareTokens('short', 'a-much-longer-token-value')).toBe(false);
    expect(safeCompareTokens('a-much-longer-token-value', 'short')).toBe(false);
  });

  it('rejects empty and missing tokens', () => {
    expect(safeCompareTokens('', '')).toBe(false);
    expect(safeCompareTokens('', 'x')).toBe(false);
    expect(safeCompareTokens('x', '')).toBe(false);
  });

  it('handles unicode tokens deterministically', () => {
    expect(safeCompareTokens('tokén-üñï', 'tokén-üñï')).toBe(true);
    expect(safeCompareTokens('tokén-üñï', 'tokén-üñ!”')).toBe(false);
  });
});

