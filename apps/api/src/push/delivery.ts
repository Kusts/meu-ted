import webpush from "web-push";
import type { PushSubscriptionStore } from "./store.js";
import type { VapidConfig } from "./vapid.js";
export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
};

type Sender = {
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
};

type DeliveryOptions = {
  store: PushSubscriptionStore;
  config: VapidConfig;
  sender?: Sender;
};

const providerStatus = (error: unknown): number | undefined => {
  if (typeof error !== "object" || error === null) return undefined;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : undefined;
};

export type PushDelivery = {
  sendToWorkspace(
    workspaceId: string,
    payload: PushPayload,
    deliveryKey?: string,
  ): Promise<{ sent: number; removed: number }>;
};

export const createWebPushDelivery = (
  options: DeliveryOptions,
): PushDelivery => {
  const sender: Sender = options.sender ?? {
    sendNotification: webpush.sendNotification,
  };
  if (!options.sender) {
    webpush.setVapidDetails(
      options.config.subject,
      options.config.publicKey,
      options.config.privateKey,
    );
  }

  return {
    async sendToWorkspace(
      workspaceId,
      payload,
      deliveryKey = `adhoc:${Date.now()}`,
    ) {
      const store = options.store;
      const subscriptions = await store.listPending(workspaceId, deliveryKey);
      let sent = 0;
      let removed = 0;
      for (const subscription of subscriptions) {
        const claimed = await store.claimDelivery(
          subscription.workspaceId,
          subscription.userId,
          subscription.endpoint,
          deliveryKey,
        );
        if (!claimed) continue;

        try {
          await sender.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            JSON.stringify(payload),
          );
        } catch (error) {
          if (providerStatus(error) === 404 || providerStatus(error) === 410) {
            try {
              if (
                await options.store.remove(
                  subscription.workspaceId,
                  subscription.userId,
                  subscription.endpoint,
                )
              ) {
                removed += 1;
              }
            } finally {
              await store.releaseDelivery(
                subscription.workspaceId,
                subscription.userId,
                subscription.endpoint,
                deliveryKey,
              );
            }
            continue;
          }
          await store.releaseDelivery(
            subscription.workspaceId,
            subscription.userId,
            subscription.endpoint,
            deliveryKey,
          );
          throw error;
        }

        sent += 1;
        // Provider success makes the result ambiguous if persistence fails.
        // Retain the claim so a retry cannot send the same push twice.
        await store.markDelivered(
          subscription.workspaceId,
          subscription.userId,
          subscription.endpoint,
          deliveryKey,
        );
      }
      return { sent, removed };
    },
  };
};
