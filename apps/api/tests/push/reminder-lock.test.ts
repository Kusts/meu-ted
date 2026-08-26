import { describe, expect, it, vi } from "vitest";
import { createPostgresReminderLock } from "../../src/push/reminder-lock.js";

describe("Postgres reminder lock", () => {
  it("holds the advisory lock on one client for the callback", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        calls.push(sql);
        return { rows: [{ locked: sql.includes("try_advisory") }] };
      }),
      release: vi.fn(),
    };
    const pool = { connect: vi.fn(async () => client) } as never;
    const result = await createPostgresReminderLock(pool).runExclusive(
      "reminders",
      async () => {
        expect(client.release).not.toHaveBeenCalled();
        return "ok";
      },
    );
    expect(result).toBe("ok");
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(calls[1]).toContain("advisory_unlock");
  });
});
