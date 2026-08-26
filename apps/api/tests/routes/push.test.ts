import { describe, expect, it, vi } from "vitest";
import { buildTestApp, TOKEN_A, TOKEN_B } from "../test-app.js";

const subscription = {
  endpoint: "https://push.example.test/subscription-a",
  keys: { p256dh: "public-key-a", auth: "auth-key-a" },
  userAgent: "Safari iOS",
};

const auth = (token: string, idempotencyKey?: string) => ({
  "x-device-token": token,
  ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
});

describe("Web Push subscriptions", () => {
  it("returns the configured public VAPID key to an authenticated workspace member", async () => {
    const { app } = buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/push/vapid-public-key",
      headers: auth(TOKEN_A),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ publicKey: "test-vapid-public-key" });
  });
  it("rejects the VAPID key without workspace authentication", async () => {
    const { app } = buildTestApp();
    const missing = await app.inject({
      method: "GET",
      url: "/push/vapid-public-key",
    });
    const invalid = await app.inject({
      method: "GET",
      url: "/push/vapid-public-key",
      headers: { "x-device-token": "invalid-token" },
    });
    expect(missing.statusCode).toBe(401);
    expect(invalid.statusCode).toBe(401);
  });

  it("registers one subscription idempotently for the authenticated actor", async () => {
    const { app } = buildTestApp();
    const first = await app.inject({
      method: "POST",
      url: "/push/subscriptions",
      headers: auth(TOKEN_A, "push-key-1"),
      payload: subscription,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/push/subscriptions",
      headers: auth(TOKEN_A, "push-key-1"),
      payload: subscription,
    });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      endpoint: subscription.endpoint,
      active: true,
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.json()).toEqual(first.json());
  });

  it("sends a notification through the authenticated workspace producer", async () => {
    const sendToWorkspace = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const { app } = buildTestApp(
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { sendToWorkspace },
    );
    const response = await app.inject({
      method: "POST",
      url: "/push/notifications",
      headers: auth(TOKEN_A, "push-notification-1"),
      payload: { title: "Conta vence", body: "Amanhã", url: "/a-pagar" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ sent: 1, removed: 0 });
    expect(sendToWorkspace).toHaveBeenCalledWith(
      expect.any(String),
      {
        title: "Conta vence",
        body: "Amanhã",
        url: "/a-pagar",
      },
      "push-notification-1",
    );
  });

  it("does not allow another workspace actor to remove the subscription", async () => {
    const { app } = buildTestApp();
    await app.inject({
      method: "POST",
      url: "/push/subscriptions",
      headers: auth(TOKEN_A, "push-key-2"),
      payload: subscription,
    });

    const forbiddenRemoval = await app.inject({
      method: "DELETE",
      url: "/push/subscriptions",
      headers: auth(TOKEN_B, "push-delete-b"),
      payload: { endpoint: subscription.endpoint },
    });
    const ownerRemoval = await app.inject({
      method: "DELETE",
      url: "/push/subscriptions",
      headers: auth(TOKEN_A, "push-delete-a"),
      payload: { endpoint: subscription.endpoint },
    });

    expect(forbiddenRemoval.statusCode).toBe(404);
    expect(ownerRemoval.statusCode).toBe(204);
  });
  it("records one delivered event after a confirmed send and ignores an idempotent replay", async () => {
    const sendToWorkspace = vi.fn().mockResolvedValue({ sent: 1, removed: 0 });
    const adoption = { record: vi.fn(), funnel: vi.fn() };
    const { app } = buildTestApp(
      {},
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { sendToWorkspace },
      adoption,
    );

    const headers = auth(TOKEN_A, "push-delivery-1");
    await app.inject({
      method: "POST",
      url: "/push/notifications",
      headers,
      payload: { title: "Conta vence" },
    });
    await app.inject({
      method: "POST",
      url: "/push/notifications",
      headers,
      payload: { title: "Conta vence" },
    });

    expect(adoption.record).toHaveBeenCalledTimes(1);
    expect(adoption.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "notification_delivered" }),
    );
  });
});
