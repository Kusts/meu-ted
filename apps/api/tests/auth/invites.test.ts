import { describe, expect, it } from 'vitest';
import {
  createInMemoryInviteStore,
  createInviteService,
  normalizeInviteEmail,
} from '../../src/auth/invites.js';

type DeliveredInvite = { email: string; token: string; inviteId: string };

const householdId = '11111111-1111-4111-8111-111111111111';

const makeService = (users = [{ id: 'user-1', email: 'member@example.com' }]) => {
  const store = createInMemoryInviteStore({ users });
  const deliveries: DeliveredInvite[] = [];
  const service = createInviteService({
    store,
    deliver: async (message) => {
      deliveries.push({ email: message.email, token: message.token, inviteId: message.inviteId });
    },
  });
  return { store, service, deliveries };
};

describe('invite flow', () => {
  it('normalizes email before storing and delivers the one-time token', async () => {
    const { service, store, deliveries } = makeService();

    const result = await service.createInvite({
      householdId,
      email: '  MEMBER@Example.COM  ',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(normalizeInviteEmail('  MEMBER@Example.COM  ')).toBe('member@example.com');
    expect(result.email).toBe('member@example.com');
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.email).toBe('member@example.com');
    expect(deliveries[0]?.token).toHaveLength(64);
    expect(store.getRawInvite(result.id)?.tokenHash).not.toBe(deliveries[0]?.token);
  });

  it('accepts an invite for the existing Better Auth user and creates one membership', async () => {
    const { service, store, deliveries } = makeService();
    const created = await service.createInvite({
      householdId,
      email: 'member@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const accepted = await service.acceptInvite({
      token: deliveries[0]!.token,
      userId: 'user-1',
      userEmail: ' MEMBER@EXAMPLE.COM ',
      now: new Date('2029-01-01T00:00:00.000Z'),
    });

    expect(accepted.inviteId).toBe(created.id);
    expect(store.listMemberships()).toEqual([{ householdId, role: 'member', userId: 'user-1' }]);
  });

  it('rejects an invalid invite token before creating membership', async () => {
    const { service, store } = makeService();

    await expect(service.acceptInvite({
      token: 'f'.repeat(64),
      userId: 'user-1',
      userEmail: 'member@example.com',
    })).rejects.toMatchObject({ code: 'invite.not_found', statusCode: 404 });
    expect(store.listMemberships()).toHaveLength(0);
  });

  it('allows only one of two concurrent accepts to consume the invite', async () => {
    const { service, store, deliveries } = makeService();
    await service.createInvite({
      householdId,
      email: 'member@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const results = await Promise.allSettled([
      service.acceptInvite({ token: deliveries[0]!.token, userId: 'user-1', userEmail: 'member@example.com' }),
      service.acceptInvite({ token: deliveries[0]!.token, userId: 'user-1', userEmail: 'member@example.com' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(store.listMemberships()).toHaveLength(1);
    expect(store.getRawInvite(deliveries[0]!.inviteId)?.acceptedAt).toBeInstanceOf(Date);
  });
});
