import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../../src/routes');
const MUTATING_ROUTE_FILES = [
  'accounts.ts',
  'auth.ts',
  'budgets.ts',
  'cards.ts',
  'categories.ts',
  'goals.ts',
  'payables.ts',
  'profile.ts',
  'subscriptions.ts',
  'transactions-write.ts',
] as const;

describe('G2.2.4 — mutation route idempotency coverage', () => {
  it('enforces a validated key centrally for every mutating HTTP method', () => {
    const source = readFileSync(resolve(ROOT, 'index.ts'), 'utf8');
    expect(source).toContain("['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)");
    expect(source).toContain('requireIdempotencyKey(req.headers)');
  });

  it.each(MUTATING_ROUTE_FILES)('%s records mutation responses for replay/conflict handling', (file) => {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    expect(source).toContain('requireIdempotencyKey');
    expect(source).toContain('lookupOrRecord');
  });

  it('keeps disabled anonymous registration outside financial mutation handling', () => {
    const source = readFileSync(resolve(ROOT, 'auth.ts'), 'utf8');
    expect(source).toContain("app.post('/auth/devices/register'");
    expect(source).toContain('auth.registration_disabled');
  });
});
