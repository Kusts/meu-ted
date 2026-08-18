import { describe, expect, it } from "vitest";
import { createPostgresReminderDedupeStore } from "../../src/push/reminder-postgres.js";

const key = "household-1:notification-1:2026-08-13:due_today_reminder";
describe("Postgres reminder dedupe", () => {
  it("claims only when the insert returns a row", async () => {
    const calls: string[] = [];
    const pool = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rowCount: 1 };
      },
    } as never;

    await expect(
      createPostgresReminderDedupeStore(pool).claim(key),
    ).resolves.toBe(true);
    expect(calls[0]).toContain("ON CONFLICT");
  });
  it("persists execution state for a claimed delivery", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rowCount: 1 };
      },
    } as never;
    const store = createPostgresReminderDedupeStore(pool);
    await store.record?.(
      key,
      { status: "failed", sent: 0, removed: 0, error: "provider down" },
      "2026-08-13T12:00:00.000Z",
    );
    expect(calls[0]?.sql).toContain("UPDATE push_reminder_deliveries");
    expect(calls[0]?.params).toContain("provider down");
  });

  it("does not claim an existing delivery and can release failed claims", async () => {
    const calls: string[] = [];
    const pool = {
      query: async (sql: string) => {
        calls.push(sql);
        return { rowCount: calls.length === 1 ? 0 : null };
      },
    } as never;
    const store = createPostgresReminderDedupeStore(pool);

    await expect(store.claim(key)).resolves.toBe(false);
    await expect(store.release?.(key)).resolves.toBeUndefined();
    expect(calls[1]).toContain("UPDATE push_reminder_deliveries");
  });
  it("quarantines stale claims so unknown delivery outcomes are never reclaimed", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const pool = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [] };
      },
    } as never;
    const store = createPostgresReminderDedupeStore(pool);
    await expect(store.recoverStale("2026-08-13T12:00:00.000Z")).resolves.toBe(
      1,
    );
    expect(calls[0]?.sql).toContain("SET status = 'quarantined'");
    expect(calls[0]?.sql).not.toContain("SET status = 'failed'");
  });
});
