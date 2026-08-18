import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync(new URL('../../src/auth/ownership-transfers-http.ts', import.meta.url), 'utf8');
const store = readFileSync(new URL('../../src/auth/ownership-transfers-postgres.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../src/read-models/sql/V022__shared_workspace_invariants.sql', import.meta.url), 'utf8');

describe('ownership transfer authentication boundary', () => {
  it('accepts only through the authenticated Better Auth destination identity', () => {
    expect(route).toContain('authenticatedContext');
    expect(route).toContain('store.accept');
    expect(store).toContain('to_user_id = target.id');
    expect(store).toContain('target.auth_user_id = $3');
    expect(route).toContain('destinationAuthUserId: context.authUserId');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('REVOKE INSERT, UPDATE, DELETE ON ownership_transfers FROM PUBLIC');
    expect(store).toContain('set_ownership_transfer_context');
  });
});
