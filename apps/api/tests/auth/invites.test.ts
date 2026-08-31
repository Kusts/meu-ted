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

  it('lists only pending invites for the workspace and omits sensitive token hashes', async () => {
    const { service, store, deliveries } = makeService([{ id: 'user-1', email: 'member1@example.com' }]);
    const otherHousehold = '22222222-2222-4222-8222-222222222222';

    // 1. Create 2 invites in householdId
    const inv1 = await service.createInvite({
      householdId,
      email: 'member1@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    const inv2 = await service.createInvite({
      householdId,
      email: 'member2@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    // 2. Create 1 invite in otherHousehold
    await service.createInvite({
      householdId: otherHousehold,
      email: 'other@example.com',
      role: 'member',
      invitedByUserId: 'owner-2',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    // 3. Accept invite 1
    await service.acceptInvite({
      token: deliveries.find((d) => d.inviteId === inv1.id)!.token,
      userId: 'user-1',
      userEmail: 'member1@example.com',
      now: new Date('2029-01-01T00:00:00.000Z'),
    });

    // 4. List pending invites for householdId: should contain ONLY inv2
    const pending = await service.listPendingInvites({ householdId, now: new Date('2029-01-01T00:00:00.000Z') });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(inv2.id);
    expect(pending[0]!.email).toBe('member2@example.com');
    expect((pending[0] as unknown as Record<string, unknown>).tokenHash).toBeUndefined();
    expect((pending[0] as unknown as Record<string, unknown>).token).toBeUndefined();
  });

  it('revokes a pending invite, removes it from pending listing and blocks acceptance', async () => {
    const { service, store, deliveries } = makeService();

    const created = await service.createInvite({
      householdId,
      email: 'revokeme@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const token = deliveries.find((d) => d.inviteId === created.id)!.token;

    // Revoke
    const revoked = await service.revokeInvite({
      householdId,
      inviteId: created.id,
      now: new Date('2029-01-01T00:00:00.000Z'),
    });
    expect(revoked.id).toBe(created.id);
    expect(revoked.householdId).toBe(householdId);
    expect(revoked.revokedAt.toISOString()).toBe('2029-01-01T00:00:00.000Z');

    // Second revoke with later timestamp must be monotonic (must not change revokedAt)
    const secondRevoke = await service.revokeInvite({
      householdId,
      inviteId: created.id,
      now: new Date('2029-06-01T00:00:00.000Z'),
    });
    expect(secondRevoke.revokedAt.toISOString()).toBe('2029-01-01T00:00:00.000Z');

    // Should not appear in pending list
    const pending = await service.listPendingInvites({ householdId, now: new Date('2029-01-01T00:00:00.000Z') });
    expect(pending.find((i) => i.id === created.id)).toBeUndefined();

    // Acceptance must fail
    await expect(service.acceptInvite({
      token,
      userId: 'user-1',
      userEmail: 'revokeme@example.com',
      now: new Date('2029-01-01T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'invite.revoked', statusCode: 410 });
  });

  it('resends a pending invite: delivers a new token, invalidates old token, and allows acceptance with new token', async () => {
    const { service, store, deliveries } = makeService([{ id: 'user-1', email: 'resend@example.com' }]);

    const created = await service.createInvite({
      householdId,
      email: 'resend@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const oldToken = deliveries[0]!.token;

    // Resend invite
    const resendResult = await service.resendInvite({
      householdId,
      inviteId: created.id,
      now: new Date('2029-01-01T00:00:00.000Z'),
    });

    expect(resendResult.id).toBe(created.id);
    expect(resendResult.email).toBe('resend@example.com');
    expect(deliveries).toHaveLength(2);

    const newToken = deliveries[1]!.token;
    expect(newToken).not.toBe(oldToken);

    // Old token must now fail to be accepted
    await expect(service.acceptInvite({
      token: oldToken,
      userId: 'user-1',
      userEmail: 'resend@example.com',
      now: new Date('2029-01-02T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'invite.not_found', statusCode: 404 });

    // New token must succeed
    const accepted = await service.acceptInvite({
      token: newToken,
      userId: 'user-1',
      userEmail: 'resend@example.com',
      now: new Date('2029-01-02T00:00:00.000Z'),
    });
    expect(accepted.inviteId).toBe(created.id);
    expect(store.listMemberships()).toEqual([{ householdId, role: 'member', userId: 'user-1' }]);
  });

  it('compensates createInvite when deliver fails: no active pending invite remains and retry creates only 1 valid invite', async () => {
    const store = createInMemoryInviteStore({ users: [{ id: 'user-1', email: 'fail@example.com' }] });
    let shouldFailDelivery = true;
    const deliveries: Array<{ token: string; email: string }> = [];
    const service = createInviteService({
      store,
      deliver: async (msg) => {
        if (shouldFailDelivery) throw new Error('SMTP connection timed out');
        deliveries.push(msg);
      },
    });

    // 1. Creation attempt fails during deliver
    await expect(service.createInvite({
      householdId,
      email: 'fail@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    })).rejects.toThrow('SMTP connection timed out');

    // 2. No pending invite remains active
    const pendingAfterFailure = await service.listPendingInvites({ householdId, now: new Date('2029-01-01T00:00:00.000Z') });
    expect(pendingAfterFailure).toHaveLength(0);

    // 3. Retry with delivery succeeding creates exactly 1 active invite
    shouldFailDelivery = false;
    const retry = await service.createInvite({
      householdId,
      email: 'fail@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const pendingAfterRetry = await service.listPendingInvites({ householdId, now: new Date('2029-01-01T00:00:00.000Z') });
    expect(pendingAfterRetry).toHaveLength(1);
    expect(pendingAfterRetry[0]!.id).toBe(retry.id);
  });

  it('compensates resendInvite when deliver fails: restores previous token and does not activate failed token', async () => {
    const store = createInMemoryInviteStore({ users: [{ id: 'user-1', email: 'resendfail@example.com' }] });
    let shouldFailResendDelivery = false;
    const deliveredTokens: string[] = [];
    const service = createInviteService({
      store,
      deliver: async (msg) => {
        if (shouldFailResendDelivery) throw new Error('Provider 500 error');
        deliveredTokens.push(msg.token);
      },
    });

    // 1. Create successfully
    const created = await service.createInvite({
      householdId,
      email: 'resendfail@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    const originalToken = deliveredTokens[0]!;

    // 2. Resend fails during deliver
    shouldFailResendDelivery = true;
    await expect(service.resendInvite({
      householdId,
      inviteId: created.id,
      now: new Date('2029-01-01T00:00:00.000Z'),
    })).rejects.toThrow('Provider 500 error');

    // 3. Original token is STILL valid and can be accepted
    const accepted = await service.acceptInvite({
      token: originalToken,
      userId: 'user-1',
      userEmail: 'resendfail@example.com',
      now: new Date('2029-01-02T00:00:00.000Z'),
    });
    expect(accepted.inviteId).toBe(created.id);
    expect(store.listMemberships()).toHaveLength(1);
  });

  it('rejects concurrent resends with CAS conflict so only one token is activated', async () => {
    const store = createInMemoryInviteStore({ users: [{ id: 'user-1', email: 'concurrent@example.com' }] });
    const deliveries: Array<{ token: string; inviteId: string }> = [];
    const service = createInviteService({
      store,
      deliver: async (msg) => {
        deliveries.push({ token: msg.token, inviteId: msg.inviteId });
      },
    });

    const created = await service.createInvite({
      householdId,
      email: 'concurrent@example.com',
      role: 'member',
      invitedByUserId: 'owner-1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    const baseToken = deliveries[0]!.token;

    // Simulate two concurrent resends starting from the same base state
    const pending = await store.getPendingInvite(householdId, created.id);
    const expectedTokenHash = pending.tokenHash;

    const tokenA = 'a'.repeat(64);
    const tokenB = 'b'.repeat(64);

    // Resend A activates first
    const activatedA = await store.activateResentInvite({
      householdId,
      inviteId: created.id,
      expectedTokenHash,
      newTokenHash: tokenA,
      newExpiresAt: new Date('2030-02-01T00:00:00.000Z'),
      now: new Date('2029-01-01T00:00:00.000Z'),
    });
    expect(activatedA.tokenHash).toBe(tokenA);

    // Resend B tries to activate with stale expectedTokenHash: MUST fail with 409 conflict
    await expect(store.activateResentInvite({
      householdId,
      inviteId: created.id,
      expectedTokenHash,
      newTokenHash: tokenB,
      newExpiresAt: new Date('2030-02-01T00:00:00.000Z'),
      now: new Date('2029-01-01T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'invite.already_used', statusCode: 409 });

    // Verify token B cannot be accepted, but token A can
    await expect(service.acceptInvite({
      token: tokenB,
      userId: 'user-1',
      userEmail: 'concurrent@example.com',
      now: new Date('2029-01-02T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'invite.not_found', statusCode: 404 });
  });
});
