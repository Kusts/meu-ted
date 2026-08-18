import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { createPostgresAdoptionStore } from "../../src/observability/adoption.js";

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let pool: Pool | undefined;

const from = new Date("2026-08-01T00:00:00.000Z");
const to = new Date("2026-08-14T23:59:59.999Z");

describe("Postgres adoption metrics integration", () => {
  beforeAll(() => {
    if (DB_URL) pool = createPool({ connectionString: DB_URL, max: 2 });
  });

  afterAll(async () => {
    await pool?.end();
  });

  itIfDatabase(
    "persists events and calculates the workspace funnel",
    async () => {
      if (!pool) throw new Error("database pool not initialized");
      const store = createPostgresAdoptionStore(pool);
      const workspaceId = randomUUID();
      const flowId = `integration-${workspaceId}`;

      try {
        await store.record({
          workspaceId,
          actorId: "integration-actor",
          eventType: "notification_delivered",
          occurredAt: new Date("2026-08-05T10:00:00.000Z"),
        });
        await store.record({
          workspaceId,
          actorId: "integration-actor",
          eventType: "notification_opened",
          occurredAt: new Date("2026-08-05T10:01:00.000Z"),
        });
        await store.record({
          workspaceId,
          actorId: "integration-actor",
          eventType: "capture_started",
          flowId,
          occurredAt: new Date("2026-08-05T10:02:00.000Z"),
        });
        await store.record({
          workspaceId,
          actorId: "integration-actor",
          eventType: "capture_completed",
          flowId,
          occurredAt: new Date("2026-08-05T10:02:01.500Z"),
        });

        const funnel = await store.funnel({ workspaceId, from, to });

        expect(funnel.delivered).toBe(1);
        expect(funnel.opened).toBe(1);
        expect(funnel.capturesStarted).toBe(1);
        expect(funnel.capturesCompleted).toBe(1);
        expect(funnel.openRate).toBe(1);
        expect(funnel.captureDurationMedianMs).toBe(1500);
      } finally {
        await pool.query(
          "DELETE FROM adoption_events WHERE workspace_id = $1",
          [workspaceId],
        );
      }
    },
  );
});
