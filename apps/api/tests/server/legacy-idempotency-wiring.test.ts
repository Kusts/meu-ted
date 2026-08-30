import { readFileSync } from "node:fs";
import Fastify from "fastify";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { registerPostgresProductionRoutes } from "../../src/server/production-routes.js";
import { HOUSEHOLD_A } from "../fixtures/seed.js";

const OPERATION_ID = "00000000-0000-4000-8000-000000000001";

function makeLegacyPool(): { pool: Pool; sql: string[] } {
  const sql: string[] = [];
  const client = {
    async query(text: string) {
      sql.push(text);
      if (text.includes("INSERT INTO operation_records")) {
        return { rowCount: 1, rows: [{ id: OPERATION_ID }] };
      }
      if (
        text.includes("INSERT INTO audit_logs") &&
        text.includes("operation_record_id")
      ) {
        throw new Error(
          'column "operation_record_id" of relation "audit_logs" does not exist',
        );
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };

  const pool = {
    async query(text: string) {
      sql.push(text);
      if (text.includes("FROM device_tokens")) {
        return {
          rowCount: 1,
          rows: [{ device_id: "legacy-device", household_id: HOUSEHOLD_A }],
        };
      }
      if (text.includes("INSERT INTO push_subscriptions")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "subscription-1",
              workspace_id: HOUSEHOLD_A,
              user_id: "legacy-device",
              endpoint: "https://push.example.test/subscription-1",
              p256dh: "p256dh",
              auth: "auth",
              user_agent: "test",
              created_at: "2026-08-29T00:00:00.000Z",
              updated_at: "2026-08-29T00:00:00.000Z",
              last_used_at: null,
            },
          ],
        };
      }
      throw new Error(`unexpected pool query: ${text}`);
    },
    async connect() {
      return client;
    },
  } as unknown as Pool;

  return { pool, sql };
}

describe("legacy production idempotency wiring", () => {
  it("uses the legacy audit shape for push subscription writes", async () => {
    const { pool, sql } = makeLegacyPool();
    const app = Fastify({ logger: false });
    registerPostgresProductionRoutes(app, pool, true, HOUSEHOLD_A);

    try {
      const response = await app.inject({
        method: "POST",
        url: "/push/subscriptions",
        headers: {
          "x-device-token": `${HOUSEHOLD_A}.legacy-token`,
          "idempotency-key": "push-subscription-1",
        },
        payload: {
          endpoint: "https://push.example.test/subscription-1",
          keys: { p256dh: "p256dh", auth: "auth" },
          userAgent: "test",
        },
      });

      expect(response.statusCode).toBe(201);
      const auditInsert = sql.find((statement) =>
        statement.includes("INSERT INTO audit_logs"),
      );
      expect(auditInsert).toContain("household_id");
      expect(auditInsert).not.toContain("operation_record_id");
    } finally {
      await app.close();
    }
  });

  it("passes legacy mode to the idempotency store in both production boot paths", () => {
    for (const file of [
      "../../src/server/index.ts",
      "../../src/server/production-routes.ts",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).toMatch(
        /createPostgresIdempotencyStore\(\{\s*pool,\s*legacy:\s*true,?\s*\}\)/,
      );
    }
  });
});
