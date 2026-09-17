import { describe, expect, it } from 'vitest';
import { createInMemoryDeviceTokenStore } from '../../src/auth/device-token.js';

const HOUSEHOLD_A = '00000000-0000-4000-8000-0000000000a1';
const HOUSEHOLD_B = '00000000-0000-4000-8000-0000000000a2';

describe('device token revocation lifecycle (V4.1 tasks 1.6/1.9)', () => {
  it('revokes every token bound to a user+workspace, including rotation descendants', async () => {
    const store = createInMemoryDeviceTokenStore();
    const first = await store.register('laptop', HOUSEHOLD_A, { userId: 'user-1' });
    const rotated = await store.rotate(first.token, 'laptop', HOUSEHOLD_A);
    const otherWorkspace = await store.register('phone', HOUSEHOLD_B, { userId: 'user-1' });
    const otherUser = await store.register('laptop', HOUSEHOLD_A, { userId: 'user-2' });

    const revoked = await store.revokeAllForUserWorkspace('user-1', HOUSEHOLD_A);

    expect(revoked).toBe(2);
    await expect(store.resolve(first.token, HOUSEHOLD_A)).rejects.toMatchObject({ code: 'auth.invalid_token' });
    await expect(store.resolve(rotated.token, HOUSEHOLD_A)).rejects.toMatchObject({ code: 'auth.invalid_token' });
    await expect(store.resolve(otherWorkspace.token, HOUSEHOLD_B)).resolves.toMatchObject({ householdId: HOUSEHOLD_B });
    await expect(store.resolve(otherUser.token, HOUSEHOLD_A)).resolves.toMatchObject({ householdId: HOUSEHOLD_A });
  });

  it('is a no-op returning zero when the user has no tokens in the workspace', async () => {
    const store = createInMemoryDeviceTokenStore();
    await expect(store.revokeAllForUserWorkspace('ghost', HOUSEHOLD_A)).resolves.toBe(0);
  });
});
