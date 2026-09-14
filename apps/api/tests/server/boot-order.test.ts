import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// API-002 regression contract: the web process never mutates schema. It must
// verify the schema before Better-Auth caches its boot-time verdict; migrations
// are a separate locked job.
const source = readFileSync(new URL('../../src/server/index.ts', import.meta.url), 'utf8');

describe('server boot order: verify-only schema before better-auth', () => {
  it('awaits verifySchema before the first createBetterAuth call', () => {
    expect(source.indexOf('await verifySchema')).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('await verifySchema')).toBeLessThan(source.indexOf('createBetterAuth({'));
  });

  it('never applies migrations in the web process', () => {
    expect(source).not.toContain('runMigrations');
    expect(source).toContain('verifySchema');
  });

  it('publishes readiness only after bootstrap', () => {
    expect(source).toContain("app.get('/ready'");
    expect(source.indexOf("app.get('/ready'")).toBeGreaterThan(source.indexOf('registerRoutes(app'));
  });

  it('leaves the in-memory path without schema migration or verification', () => {
    const inMemoryPath = source.slice(source.indexOf('no DATABASE_URL'));
    expect(inMemoryPath).not.toContain('runMigrations');
    expect(inMemoryPath).not.toContain('verifySchema');
  });
});
