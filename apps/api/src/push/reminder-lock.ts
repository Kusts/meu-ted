import type { Pool } from "pg";
import type { ReminderLock } from "./reminder-scheduler.js";

export const createPostgresReminderLock = (pool: Pool): ReminderLock => ({
  async runExclusive(key, fn) {
    const client = await pool.connect();
    try {
      const result = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked",
        [key],
      );
      if (!result.rows[0]?.locked) return undefined;
      try {
        return await fn();
      } finally {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [key],
        );
      }
    } finally {
      client.release();
    }
  },
});
