import { describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { createWebPushDelivery } from "../../src/push/delivery.js";
import type {
  PushSubscription,
  PushSubscriptionStore,
} from "../../src/push/store.js";
import { createInMemoryPushSubscriptionStore } from "../../src/push/store.js";

const row: PushSubscription = {
  id: "subscription-1",
  workspaceId: "workspace-1",
  userId: "user-1",
  endpoint: "https://push.example.test/a",
  p256dh: "public",
  auth: "auth",
  createdAt: "now",
  updatedAt: "now",
};
const config = {
  subject: "mailto:ops@example.test",
  publicKey: "public",
  privateKey: "private",
};

function makeStore(): PushSubscriptionStore & {
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    upsert: vi.fn(),
    list: vi.fn().mockResolvedValue([row]),
    listPending: vi.fn().mockResolvedValue([row]),
    claimDelivery: vi.fn().mockResolvedValue(true),
    markDelivered: vi.fn().mockResolvedValue(undefined),
    releaseDelivery: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(true),
    removeAllForUserWorkspace: vi.fn().mockResolvedValue(0),
  };
}

describe("Web Push delivery", () => {
  it("sends a JSON notification through the VAPID-configured sender", async () => {
    const store = makeStore();
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const delivery = createWebPushDelivery({
      store,
      config,
      sender: { sendNotification },
    });

    await delivery.sendToWorkspace("workspace-1", {
      title: "Conta vence",
      body: "Amanhã",
      url: "/a-pagar",
    });

    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify({ title: "Conta vence", body: "Amanhã", url: "/a-pagar" }),
    );
  });

  it("configures the real web-push sender with the private VAPID key", async () => {
    const store = makeStore();
    const setVapidDetails = vi
      .spyOn(webpush, "setVapidDetails")
      .mockImplementation(() => undefined);
    const sendNotification = vi
      .spyOn(webpush, "sendNotification")
      .mockResolvedValue({ statusCode: 201 } as never);
    const delivery = createWebPushDelivery({ store, config });

    await delivery.sendToWorkspace("workspace-1", { title: "Atualização" });

    expect(setVapidDetails).toHaveBeenCalledWith(
      config.subject,
      config.publicKey,
      config.privateKey,
    );
    expect(sendNotification).toHaveBeenCalledTimes(1);
    setVapidDetails.mockRestore();
    sendNotification.mockRestore();
  });

  it("releases subscriptions rejected as gone by the push provider", async () => {
    const store = makeStore();
    const sendNotification = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    const delivery = createWebPushDelivery({
      store,
      config,
      sender: { sendNotification },
    });

    await delivery.sendToWorkspace("workspace-1", { title: "Atualização" });

    expect(store.remove).toHaveBeenCalledWith(
      row.workspaceId,
      row.userId,
      row.endpoint,
    );
    expect(store.releaseDelivery).toHaveBeenCalledWith(
      row.workspaceId,
      row.userId,
      row.endpoint,
      expect.any(String),
    );
  });

  it("retries failed subscriptions using the real in-memory store", async () => {
    const store = createInMemoryPushSubscriptionStore();
    await store.upsert(row);
    await store.upsert({
      ...row,
      id: "subscription-2",
      userId: "user-2",
      endpoint: "https://push.example.test/b",
    });
    const sendNotification = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(undefined);
    const delivery = createWebPushDelivery({
      store,
      config,
      sender: { sendNotification },
    });
    const deliveryKey = "integration-reminder";

    await expect(
      delivery.sendToWorkspace(
        "workspace-1",
        { title: "Atualização" },
        deliveryKey,
      ),
    ).rejects.toThrow("temporary failure");
    await delivery.sendToWorkspace(
      "workspace-1",
      { title: "Atualização" },
      deliveryKey,
    );

    expect(sendNotification).toHaveBeenCalledTimes(3);
    expect(sendNotification.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ endpoint: row.endpoint }),
    );
    expect(sendNotification.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ endpoint: "https://push.example.test/b" }),
    );
    expect(sendNotification.mock.calls[2]?.[0]).toEqual(
      expect.objectContaining({ endpoint: "https://push.example.test/b" }),
    );
  });

  it("keeps the claim when persistence fails after provider success", async () => {
    const store = makeStore();
    store.markDelivered.mockRejectedValueOnce(new Error("persistence failure"));
    const sendNotification = vi.fn().mockResolvedValue(undefined);
    const delivery = createWebPushDelivery({
      store,
      config,
      sender: { sendNotification },
    });
    const deliveryKey = "reminder-2026-08-13";

    await expect(
      delivery.sendToWorkspace(
        "workspace-1",
        { title: "Atualização" },
        deliveryKey,
      ),
    ).rejects.toThrow("persistence failure");
    expect(store.markDelivered).toHaveBeenCalledWith(
      row.workspaceId,
      row.userId,
      row.endpoint,
      deliveryKey,
    );
  });
});
