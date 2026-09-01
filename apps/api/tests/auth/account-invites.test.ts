import { describe, expect, it } from 'vitest';
import { createInMemoryAccountInviteStore, createAccountInviteService } from '../../src/auth/account-invites.js';

describe('account invite flow', () => {
  it('creates an account invite and verifies it', async () => {
    const store = createInMemoryAccountInviteStore();
    const deliveries: Array<{ email: string; token: string }> = [];
    const service = createAccountInviteService({
      store,
      deliver: async (msg) => {
        deliveries.push({ email: msg.email, token: msg.token });
      },
    });

    const created = await service.createAccountInvite({
      email: 'newuser@example.com',
      invitedByUserId: 'admin-1',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    expect(created.email).toBe('newuser@example.com');
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.email).toBe('newuser@example.com');
    expect(deliveries[0]!.token).toHaveLength(64);

    const verified = await service.verifyAccountInvite({ token: deliveries[0]!.token });
    expect(verified.email).toBe('newuser@example.com');
    expect(verified.id).toBe(created.id);
  });

  it('rejects invalid token', async () => {
    const store = createInMemoryAccountInviteStore();
    const service = createAccountInviteService({
      store,
      deliver: async () => {},
    });

    await expect(service.verifyAccountInvite({ token: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'invite.not_found' });
  });

  it('consumes account invite after signup', async () => {
    const store = createInMemoryAccountInviteStore();
    const service = createAccountInviteService({
      store,
      deliver: async () => {},
    });

    await service.createAccountInvite({
      email: 'consume@example.com',
      invitedByUserId: 'admin-1',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    expect(await store.hasPendingAccountInvite('consume@example.com')).toBe(true);
    await service.consumeAccountInvite({ email: 'consume@example.com' });
    expect(await store.hasPendingAccountInvite('consume@example.com')).toBe(false);
  });
});
