import { describe, expect, it } from 'vitest';
import { createReconnectTokenStore } from '../../src/auth/reconnect-tokens.js';

describe('reconnect token store', () => {
  it('rejects a token after its session is revoked', () => {
    const store = createReconnectTokenStore({ now: () => 1_000 });
    const token = store.issue('session-1', 60_000);

    expect(store.validate(token, 'session-1')).toBe(true);
    store.invalidateSession('session-1');
    expect(store.validate(token, 'session-1')).toBe(false);
    expect(store.validate(token, 'session-2')).toBe(false);
  });

  it('invalidates every session token for a removed user', () => {
    const store = createReconnectTokenStore({ now: () => 1_000 });
    const token = store.issue('session-1', 60_000, 'user-1');
    store.invalidateUser('user-1');
    expect(store.resolve(token)).toBeNull();
  });

  it('rejects expired tokens', () => {
    let now = 1_000;
    const store = createReconnectTokenStore({ now: () => now });
    const token = store.issue('session-1', 10);
    now = 1_011;
    expect(store.validate(token, 'session-1')).toBe(false);
  });
});
