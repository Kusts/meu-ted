import { describe, expect, it } from 'vitest';
import { shouldApplyMigrationsInWeb, WEB_MIGRATION_MODE } from '../../src/server/migration-policy.js';

describe('G0.4.5 — web migration policy', () => {
  it('is permanently verify-only', () => {
    expect(WEB_MIGRATION_MODE).toBe('verify-only');
    expect(shouldApplyMigrationsInWeb()).toBe(false);
  });
});
