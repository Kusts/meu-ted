import { describe, expect, it } from 'vitest';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';

describe('in-memory device token workspace scope', () => {
  it('does not revoke a token with a different household context', async () => {
    const store = createInMemoryDeviceTokenStore();
    const created = await store.register('scope-test', 'household-a');

    await store.revoke(created.token, 'household-b');
    await expect(store.resolve(created.token)).resolves.toMatchObject({ householdId: 'household-a' });

    await store.revoke(created.token, 'household-a');
    await expect(store.resolve(created.token)).rejects.toMatchObject({ code: 'auth.invalid_token' });
  });
});
