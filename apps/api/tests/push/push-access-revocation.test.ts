import { describe, expect, it, vi } from 'vitest';
import {
  createInMemoryPushSubscriptionStore,
  type PushSubscriptionStore,
} from '../../src/push/store.js';
import { createWebPushDelivery } from '../../src/push/delivery.js';

const WORKSPACE = '00000000-0000-4000-8000-0000000000b1';

const subscription = (userId: string, endpoint: string) => ({
  workspaceId: WORKSPACE,
  userId,
  endpoint,
  p256dh: 'p256dh',
  auth: 'auth',
});

const config = { subject: 'mailto:ops@example.test', publicKey: 'public', privateKey: 'private' };

describe('push revocation lifecycle (V4.1 tasks 1.8/1.9)', () => {
  it('removes every subscription of a revoked user in the workspace only', async () => {
    const store = createInMemoryPushSubscriptionStore();
    await store.upsert(subscription('user-removed', 'https://push.example.test/removed'));
    await store.upsert(subscription('user-active', 'https://push.example.test/active'));

    const removed = await (store as PushSubscriptionStore).removeAllForUserWorkspace(WORKSPACE, 'user-removed');

    expect(removed).toBe(1);
    expect(await store.list(WORKSPACE)).toMatchObject([{ userId: 'user-active' }]);
  });

  it('filters reads to active members when a membership predicate is provided', async () => {
    const active = new Set([`${WORKSPACE}:user-active`]);
    const store = createInMemoryPushSubscriptionStore({
      isActiveMember: (workspaceId: string, userId: string) => active.has(`${workspaceId}:${userId}`),
    });
    await store.upsert(subscription('user-removed', 'https://push.example.test/removed'));
    await store.upsert(subscription('user-active', 'https://push.example.test/active'));

    expect(await store.list(WORKSPACE)).toMatchObject([{ userId: 'user-active' }]);
    expect(await store.listPending(WORKSPACE, 'reminder:1')).toMatchObject([{ userId: 'user-active' }]);
  });

  it('delivers zero push to a purged member while survivors still receive', async () => {
    const store = createInMemoryPushSubscriptionStore();
    await store.upsert(subscription('user-removed', 'https://push.example.test/removed'));
    await store.upsert(subscription('user-active', 'https://push.example.test/active'));
    await (store as PushSubscriptionStore).removeAllForUserWorkspace(WORKSPACE, 'user-removed');

    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const delivery = createWebPushDelivery({ store, config, sender: { sendNotification } });
    const result = await delivery.sendToWorkspace(WORKSPACE, { title: 'Conta vence' }, 'reminder:1');

    expect(result).toMatchObject({ sent: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://push.example.test/active' }),
      expect.any(String),
    );
  });
});
