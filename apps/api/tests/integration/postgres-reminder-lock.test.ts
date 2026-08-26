import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../../src/db/pool.js";
import { createPostgresReminderLock } from "../../src/push/reminder-lock.js";

const DB_URL = process.env.DATABASE_URL_TEST;
const ENABLED = Boolean(DB_URL && process.env.DB_TEST_MARKER);
const itIfDatabase = ENABLED ? it : it.skip;
let firstPool: Pool | undefined;
let secondPool: Pool | undefined;

describe("Postgres reminder lock integration", () => {
  beforeAll(() => {
    if (!DB_URL) return;
    firstPool = createPool({ connectionString: DB_URL, max: 2 });
    secondPool = createPool({ connectionString: DB_URL, max: 2 });
  });

  afterAll(async () => {
    await firstPool?.end();
    await secondPool?.end();
  });

  itIfDatabase(
    "allows one concurrent scheduler run and skips the other",
    async () => {
      const primary = firstPool;
      const contender = secondPool;
      if (!primary || !contender)
        throw new Error("database pools not initialized");
      const firstLock = createPostgresReminderLock(primary);
      const secondLock = createPostgresReminderLock(contender);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const running = firstLock.runExclusive(
        "integration-reminder-lock",
        async () => {
          await held;
          return "first";
        },
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      await expect(
        secondLock.runExclusive(
          "integration-reminder-lock",
          async () => "second",
        ),
      ).resolves.toBeUndefined();
      release();
      await expect(running).resolves.toBe("first");
    },
  );
});
