import { describe, expect, it, vi } from "vitest";
import {
  createInMemoryAdoptionStore,
  createPostgresAdoptionStore,
} from "../../src/observability/adoption.js";

describe("adoption store", () => {
  it("aggregates the funnel and capture duration per workspace", async () => {
    const store = createInMemoryAdoptionStore();
    const base = "2026-08-14T10:00:00.000Z";
    const event = (
      eventType: Parameters<typeof store.record>[0]["eventType"],
      minute: number,
      flowId?: string,
    ) =>
      store.record({
        workspaceId: "workspace-a",
        actorId: "actor-a",
        eventType,
        occurredAt: new Date(new Date(base).getTime() + minute * 60_000),
        ...(flowId ? { flowId } : {}),
      });

    await event("notification_delivered", 0);
    await event("notification_opened", 1);
    await event("chat_used", 2);
    await event("capture_started", 3, "flow-a");
    await event("capture_completed", 4, "flow-a");
    await event("notification_delivered", 0, "other-flow");
    await store.record({
      workspaceId: "workspace-b",
      actorId: "actor-b",
      eventType: "notification_delivered",
      occurredAt: new Date(base),
    });

    const result = await store.funnel({
      workspaceId: "workspace-a",
      from: new Date("2026-08-14T00:00:00.000Z"),
      to: new Date("2026-08-14T23:59:59.999Z"),
    });

    expect(result).toMatchObject({
      delivered: 2,
      opened: 1,
      chatUsed: 1,
      capturesStarted: 1,
      capturesCompleted: 1,
      openRate: 0.5,
      chatRate: 1,
      captureStartRate: 1,
      captureCompletionRate: 1,
      captureDurationMedianMs: 60_000,
      captureDurationP95Ms: 60_000,
    });
  });

  it("does not mix events from another workspace", async () => {
    const store = createInMemoryAdoptionStore();
    await store.record({
      workspaceId: "workspace-b",
      actorId: "actor-b",
      eventType: "notification_delivered",
      occurredAt: new Date("2026-08-14T10:00:00.000Z"),
    });

    const result = await store.funnel({
      workspaceId: "workspace-a",
      from: new Date("2026-08-14T00:00:00.000Z"),
      to: new Date("2026-08-14T23:59:59.999Z"),
    });

    expect(result.delivered).toBe(0);
  });
  it("uses a distinct capture-pairs relation for Postgres duration aggregates", async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          delivered: 0,
          opened: 0,
          chat_used: 0,
          captures_started: 2,
          captures_completed: 2,
          median_ms: 1500,
          p95_ms: 3000,
        },
      ],
    });
    const store = createPostgresAdoptionStore({ query } as never);

    await store.funnel({
      workspaceId: "workspace-a",
      from: new Date("2026-08-14T00:00:00.000Z"),
      to: new Date("2026-08-14T23:59:59.999Z"),
    });

    const sql = query.mock.calls[0]?.[0] as string;
    expect(sql).toContain("capture_pairs");
    expect(sql).not.toContain(
      "JOIN selected completed ON completed.flow_id = started.flow_id",
    );
  });
});
