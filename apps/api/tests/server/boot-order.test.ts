import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Regression contract: better-auth caches its boot-time schema verdict, so
// migrations must complete BEFORE createBetterAuth in the DATABASE_URL path.
// Static source-order test: booting the real server in a test is expensive,
// but the ordering invariant is fully captured by call order in index.ts.
const source = readFileSync(new URL('../../src/server/index.ts', import.meta.url), 'utf8');

describe('server boot order: migrations before better-auth', () => {
  it('awaits runMigrations before the first createBetterAuth call', () => {
    expect(source.indexOf('await runMigrations')).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('await runMigrations')).toBeLessThan(source.indexOf('createBetterAuth({'));
  });

  it('runs migrations exactly once in the DATABASE_URL path', () => {
    // A single awaited call site (legacyOnly decided by DB_SCHEMA).
    expect(source.match(/await runMigrations\(/g)).toHaveLength(1);
    expect(source).toContain('} from "../read-models/sql/migrate.js"');
  });

  it('preserves the existing observability log messages', () => {
    expect(source).toContain('legacy-safe migrations applied');
    expect(source).toContain('using postgres stores');
  });

  it('leaves the in-memory path (no DATABASE_URL) without migrations', () => {
    const inMemoryPath = source.slice(source.indexOf('no DATABASE_URL'));
    expect(inMemoryPath).not.toContain('runMigrations');
  });
});
