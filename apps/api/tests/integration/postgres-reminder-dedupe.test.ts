import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { createPostgresReminderDedupeStore } from "../../src/push/reminder-postgres.js";

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
const schema = `reminder_test_${process.pid}_${Date.now()}`;
const householdId = "11111111-1111-4111-8111-111111111111";
const notificationId = "22222222-2222-4222-8222-222222222222";
const notificationType = "due_today_reminder";

let adminPool: Pool | undefined;
let pool: Pool | undefined;

const scopedUrl = (value: string): string => {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${schema},public`);
  return url.toString();
};

describe("Postgres reminder dedupe integration", () => {
  beforeAll(async () => {
    if (!DB_URL) return;
    adminPool = createPool({ connectionString: DB_URL, max: 4 });
    await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    pool = createPool({ connectionString: scopedUrl(DB_URL), max: 4 });
    const database = pool;
    if (!database) throw new Error("database pool not initialized");
    await database.query(`CREATE TABLE notification_configs (
      id UUID PRIMARY KEY,
      household_id UUID NOT NULL,
      chat_id TEXT NOT NULL,
      notification_type TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const migrationPath = fileURLToPath(
      new URL(
        "../../src/read-models/sql/V025__push_reminder_scheduler.sql",
        import.meta.url,
      ),
    );
    await database.query(readFileSync(migrationPath, "utf8"));
  }, 30_000);
  afterAll(async () => {
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  });
  itIfDatabase(
    "atomically claims one of concurrent attempts and preserves sent state",
    async () => {
      const database = pool;
      if (!database) throw new Error("database pool not initialized");
      const store = createPostgresReminderDedupeStore(database);
      const key = `${householdId}:${notificationId}:2026-08-13:${notificationType}`;
      const claims = await Promise.all([store.claim(key), store.claim(key)]);
      expect(claims.sort()).toEqual([false, true]);
      await store.record?.(
        key,
        { status: "sent", sent: 1, removed: 0 },
        "2026-08-13T12:00:00.000Z",
      );
      await store.record?.(
        key,
        { status: "deduplicated", sent: 0, removed: 0 },
        "2026-08-13T12:01:00.000Z",
      );
      const row = await database.query(
        "SELECT status, sent_count FROM push_reminder_deliveries WHERE household_id = $1",
        [householdId],
      );
      expect(row.rows[0]).toMatchObject({ status: "sent", sent_count: 1 });
    },
  );
  itIfDatabase(
    "quarantines stale claims instead of allowing an unsafe retry",
    async () => {
      const database = pool;
      if (!database) throw new Error("database pool not initialized");
      const store = createPostgresReminderDedupeStore(database);
      const key = `${householdId}:${notificationId}:2026-08-14:${notificationType}`;
      await expect(store.claim(key)).resolves.toBe(true);
      await database.query(
        "UPDATE push_reminder_deliveries SET claimed_at = $1::timestamptz WHERE local_date = $2::date",
        ["2026-08-14T11:00:00.000Z", "2026-08-14"],
      );
      await expect(store.claim(key)).resolves.toBe(false);
      await expect(
        store.recoverStale?.("2026-08-14T12:00:00.000Z"),
      ).resolves.toBe(1);
      await expect(store.claim(key)).resolves.toBe(false);
    },
  );
});
