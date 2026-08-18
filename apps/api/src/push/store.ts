export type PushSubscription = {
  id: string;
  workspaceId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};

export type UpsertPushSubscriptionInput = {
  workspaceId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
};

export interface PushSubscriptionStore {
  upsert(input: UpsertPushSubscriptionInput): Promise<PushSubscription>;
  list(workspaceId: string): Promise<PushSubscription[]>;
  listPending(
    workspaceId: string,
    deliveryKey: string,
  ): Promise<PushSubscription[]>;
  claimDelivery(
    workspaceId: string,
    userId: string,
    endpoint: string,
    deliveryKey: string,
  ): Promise<boolean>;
  markDelivered(
    workspaceId: string,
    userId: string,
    endpoint: string,
    deliveryKey: string,
  ): Promise<void>;
  releaseDelivery(
    workspaceId: string,
    userId: string,
    endpoint: string,
    deliveryKey: string,
  ): Promise<void>;
  remove(
    workspaceId: string,
    userId: string,
    endpoint: string,
  ): Promise<boolean>;
}

export const createInMemoryPushSubscriptionStore =
  (): PushSubscriptionStore => {
    const rows = new Map<string, PushSubscription>();
    const delivered = new Set<string>();
    const claimed = new Set<string>();
    const keyOf = (
      input: Pick<
        UpsertPushSubscriptionInput,
        "workspaceId" | "userId" | "endpoint"
      >,
    ): string => `${input.workspaceId}:${input.userId}:${input.endpoint}`;
    const deliveryKeyOf = (
      workspaceId: string,
      userId: string,
      endpoint: string,
      deliveryKey: string,
    ): string => `${workspaceId}:${userId}:${endpoint}:${deliveryKey}`;
    const now = (): string => new Date().toISOString();
    return {
      async upsert(input) {
        const key = keyOf(input);
        const previous = rows.get(key);
        const timestamp = now();
        const row: PushSubscription = {
          id: previous?.id ?? crypto.randomUUID(),
          workspaceId: input.workspaceId,
          userId: input.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          ...(input.userAgent ? { userAgent: input.userAgent } : {}),
          createdAt: previous?.createdAt ?? timestamp,
          updatedAt: timestamp,
          ...(previous?.lastUsedAt ? { lastUsedAt: previous.lastUsedAt } : {}),
        };
        rows.set(key, row);
        return row;
      },
      async list(workspaceId) {
        return [...rows.values()].filter(
          (row) => row.workspaceId === workspaceId,
        );
      },
      async listPending(workspaceId, deliveryKey) {
        return [...rows.values()].filter(
          (row) =>
            row.workspaceId === workspaceId &&
            !delivered.has(
              deliveryKeyOf(
                row.workspaceId,
                row.userId,
                row.endpoint,
                deliveryKey,
              ),
            ) &&
            !claimed.has(
              deliveryKeyOf(
                row.workspaceId,
                row.userId,
                row.endpoint,
                deliveryKey,
              ),
            ),
        );
      },
      async markDelivered(workspaceId, userId, endpoint, deliveryKey) {
        const deliveryKeyValue = deliveryKeyOf(
          workspaceId,
          userId,
          endpoint,
          deliveryKey,
        );
        delivered.add(deliveryKeyValue);
        claimed.delete(deliveryKeyValue);
      },
      async claimDelivery(workspaceId, userId, endpoint, deliveryKey) {
        const key = deliveryKeyOf(workspaceId, userId, endpoint, deliveryKey);
        if (delivered.has(key) || claimed.has(key)) return false;
        claimed.add(key);
        return true;
      },
      async releaseDelivery(workspaceId, userId, endpoint, deliveryKey) {
        claimed.delete(
          deliveryKeyOf(workspaceId, userId, endpoint, deliveryKey),
        );
      },
      async remove(workspaceId, userId, endpoint) {
        return rows.delete(keyOf({ workspaceId, userId, endpoint }));
      },
    };
  };
