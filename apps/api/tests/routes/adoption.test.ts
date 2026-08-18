import { describe, expect, it } from "vitest";
import { buildTestApp, TOKEN_A, TOKEN_B } from "../test-app.js";

const auth = (token: string) => ({ "x-device-token": token });
const event = (eventType: string, occurredAt: string, flowId?: string) => ({
  eventType,
  occurredAt,
  ...(flowId ? { flowId } : {}),
});

describe("adoption observability routes", () => {
  it("records events and returns a workspace-scoped funnel", async () => {
    const { app } = buildTestApp();
    const headers = auth(TOKEN_A);
    const events = [
      event("notification_delivered", "2026-08-14T10:00:00.000Z"),
      event("notification_opened", "2026-08-14T10:01:00.000Z"),
      event("chat_used", "2026-08-14T10:02:00.000Z"),
      event("capture_started", "2026-08-14T10:03:00.000Z", "flow-a"),
      event("capture_completed", "2026-08-14T10:04:00.000Z", "flow-a"),
    ];

    for (const payload of events) {
      const response = await app.inject({
        method: "POST",
        url: "/observability/adoption-events",
        headers,
        payload,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ accepted: true });
    }

    const funnel = await app.inject({
      method: "GET",
      url: "/observability/adoption-funnel?from=2026-08-14&to=2026-08-14",
      headers,
    });

    expect(funnel.statusCode).toBe(200);
    expect(funnel.json()).toMatchObject({
      delivered: 1,
      opened: 1,
      chatUsed: 1,
      capturesStarted: 1,
      capturesCompleted: 1,
      captureDurationMedianMs: 60_000,
    });

    const otherWorkspace = await app.inject({
      method: "GET",
      url: "/observability/adoption-funnel?from=2026-08-14&to=2026-08-14",
      headers: auth(TOKEN_B),
    });
    expect(otherWorkspace.statusCode).toBe(200);
    expect(otherWorkspace.json().delivered).toBe(0);
  });

  it("requires authentication and rejects unknown event types", async () => {
    const { app } = buildTestApp();
    const missingAuth = await app.inject({
      method: "POST",
      url: "/observability/adoption-events",
      payload: event("chat_used", "2026-08-14T10:00:00.000Z"),
    });
    expect(missingAuth.statusCode).toBe(401);

    const invalid = await app.inject({
      method: "POST",
      url: "/observability/adoption-events",
      headers: auth(TOKEN_A),
      payload: { eventType: "secret_payload" },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
