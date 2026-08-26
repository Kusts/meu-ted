#!/usr/bin/env tsx
import { createPool } from "../db/pool.js";
import { loadConfig } from "../env.js";
import { createPostgresPayableStore } from "../payables/postgres.js";
import { createWebPushDelivery } from "../push/delivery.js";
import { createPostgresPushSubscriptionStore } from "../push/postgres.js";
import { createPostgresReminderScheduler } from "../push/reminder-runtime.js";
import { loadVapidConfig } from "../push/vapid.js";

const main = async (): Promise<void> => {
  const config = loadConfig();
  const vapid = loadVapidConfig();
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
  if (!vapid) throw new Error("Web Push VAPID configuration is required");

  const pool = createPool({ connectionString: config.databaseUrl });
  try {
    const store = createPostgresPayableStore(pool);
    const pushStore = createPostgresPushSubscriptionStore(pool);
    const delivery = createWebPushDelivery({ store: pushStore, config: vapid });
    const scheduler = createPostgresReminderScheduler({
      pool,
      payableStore: store,
      delivery,
    });
    const result = await scheduler.run();
    process.stdout.write(`${JSON.stringify(result)}\n`);
    for (const event of result.events) {
      process.stdout.write(`${JSON.stringify({ event })}\n`);
    }
  } finally {
    await pool.end();
  }
};

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "unknown error"}\n`,
  );
  process.exitCode = 1;
});
