import Fastify from "fastify";
import {
  createInMemoryDeviceTokenStore,
  createPostgresDeviceTokenStore,
} from "../auth/device-token.js";
import { createInMemoryBudgetStore } from "../budgets/in-memory.js";
import { createPostgresBudgetStore } from "../budgets/postgres.js";
import { createInMemoryCardStore } from "../cards/in-memory.js";
import { createLegacyPostgresCardStore } from "../cards/legacy-postgres.js";
import { createPostgresCardStore } from "../cards/postgres.js";
import { createPool } from "../db/pool.js";
import { createPostgresContextTokenReplayGuard } from "../auth/context-token-replay-postgres.js";
import { createPostgresAdoptionStore } from "../observability/adoption.js";
import { loadConfig } from "../env.js";
import { createInMemoryGoalStore } from "../goals/in-memory.js";
import { createLegacyPostgresGoalStore } from "../goals/legacy-postgres.js";
import { createPostgresGoalStore } from "../goals/postgres.js";
import { createInMemoryPayableStore } from "../payables/in-memory.js";
import { createLegacyPostgresPayableStore } from "../payables/legacy-postgres.js";
import { createPostgresPayableStore } from "../payables/postgres.js";
import { createInMemoryProfileStore } from "../profile/in-memory.js";
import { createPostgresProfileStore } from "../profile/postgres.js";
import { createWebPushDelivery } from "../push/delivery.js";
import { createPostgresPushSubscriptionStore } from "../push/postgres.js";
import { createPostgresReminderScheduler } from "../push/reminder-runtime.js";
import { createInMemoryPushSubscriptionStore } from "../push/store.js";
import { loadVapidConfig } from "../push/vapid.js";
import { createLegacyPostgresReadModelStore } from "../read-models/legacy-postgres-store.js";
import { createPostgresReadModelStore } from "../read-models/postgres-store.js";
import { runMigrations } from "../read-models/sql/migrate.js";
import { createInMemoryReadModelStoreFromState } from "../read-models/store.js";
import { registerRoutes } from "../routes/index.js";
import { createInMemorySubscriptionStore } from "../subscriptions/in-memory.js";
import { createLegacyPostgresSubscriptionStore } from "../subscriptions/legacy-postgres.js";
import { createPostgresSubscriptionStore } from "../subscriptions/postgres.js";
import { createInMemoryIdempotencyStore } from "../writes/idempotency.js";
import { createInMemoryStores } from "../writes/in-memory.js";
import { createLegacyPostgresWriteStore } from "../writes/legacy-postgres.js";
import {
  createPostgresIdempotencyStore,
  createPostgresWriteStore,
} from "../writes/postgres.js";
import { registerCors } from "./cors.js";

const start = async (): Promise<void> => {
  const cfg = loadConfig();
  const vapid = loadVapidConfig();
  const app = Fastify({ logger: true });
  registerCors(app);

  if (cfg.databaseUrl) {
    const pool = createPool({ connectionString: cfg.databaseUrl });

    if (process.env.DB_SCHEMA === "legacy") {
      app.log.info("using legacy pi_financeiro schema adapters");
      const result = await runMigrations(pool, true);
      app.log.info(
        { legacyMigrations: result.applied },
        "legacy-safe migrations applied",
      );
      const store = createLegacyPostgresReadModelStore({ pool });
      const writes = createLegacyPostgresWriteStore({ pool });
      const tokenStore = createPostgresDeviceTokenStore(pool);
      const idempotency = createPostgresIdempotencyStore({ pool });
      const cardStore = createLegacyPostgresCardStore(pool);
      const payableStore = createLegacyPostgresPayableStore(pool);
      const budgetStore = createPostgresBudgetStore(pool);
      const goalStore = createLegacyPostgresGoalStore(pool);
      const subscriptionStore = createLegacyPostgresSubscriptionStore(pool);
      const profileStore = createPostgresProfileStore({ pool });
      const pushStore = createPostgresPushSubscriptionStore(pool);
      const pushDelivery = vapid
        ? createWebPushDelivery({ store: pushStore, config: vapid })
        : undefined;
      const reminderScheduler =
        vapid && pushDelivery
          ? createPostgresReminderScheduler({
              pool,
              payableStore,
              delivery: pushDelivery,
            })
          : undefined;
      if (reminderScheduler) {
        const runReminderJob = (): void => {
          void reminderScheduler
            .run()
            .then((result) => {
              app.log.info(
                {
                  event: "push_reminder_run",
                  processed: result.processed,
                  sent: result.sent,
                  removed: result.removed,
                  deduplicated: result.deduplicated,
                  failed: result.failed,
                  lockSkipped: result.lockSkipped,
                  metrics: result.metrics,
                  events: result.events,
                },
                "push reminder job completed",
              );
            })
            .catch((error: unknown) => {
              app.log.error({ error }, "push reminder job failed");
            });
        };
        runReminderJob();
        const timer = setInterval(runReminderJob, 60_000);
        timer.unref();
        app.addHook("onClose", async () => clearInterval(timer));
      }
      registerRoutes(app, {
        store,
        writes,
        tokenStore,
        contextReplayGuard: createPostgresContextTokenReplayGuard(pool),
        idempotency,
        defaultHouseholdId: cfg.defaultHouseholdId,
        cardStore,
        payableStore,
        budgetStore,
        goalStore,
        subscriptionStore,
        profileStore,
        pushStore,
        ...(vapid?.publicKey ? { vapidPublicKey: vapid.publicKey } : {}),
        ...(pushDelivery ? { pushDelivery } : {}),
      });
    } else {
      const result = await runMigrations(pool);
      app.log.info(
        { database: "postgres", appliedMigrations: result.applied },
        "using postgres stores",
      );
      const store = createPostgresReadModelStore({ pool });
      const writes = createPostgresWriteStore({ pool });
      const tokenStore = createPostgresDeviceTokenStore(pool);
      const idempotency = createPostgresIdempotencyStore({ pool });
      const cardStore = createPostgresCardStore(pool);
      const payableStore = createPostgresPayableStore(pool);
      const budgetStore = createPostgresBudgetStore(pool);
      const goalStore = createPostgresGoalStore(pool);
      const subscriptionStore = createPostgresSubscriptionStore(pool);
      const profileStore = createPostgresProfileStore({ pool });
      const pushStore = createPostgresPushSubscriptionStore(pool);
      const adoptionStore = createPostgresAdoptionStore(pool);
      const pushDelivery = vapid
        ? createWebPushDelivery({ store: pushStore, config: vapid })
        : undefined;
      const reminderScheduler =
        vapid && pushDelivery
          ? createPostgresReminderScheduler({
              pool,
              payableStore,
              delivery: pushDelivery,
            })
          : undefined;
      if (reminderScheduler) {
        const runReminderJob = (): void => {
          void reminderScheduler
            .run()
            .then((result) => {
              app.log.info(
                {
                  event: "push_reminder_run",
                  processed: result.processed,
                  sent: result.sent,
                  removed: result.removed,
                  deduplicated: result.deduplicated,
                  failed: result.failed,
                  lockSkipped: result.lockSkipped,
                  metrics: result.metrics,
                  events: result.events,
                },
                "push reminder job completed",
              );
            })
            .catch((error: unknown) => {
              app.log.error({ error }, "push reminder job failed");
            });
        };
        runReminderJob();
        const timer = setInterval(runReminderJob, 60_000);
        timer.unref();
        app.addHook("onClose", async () => clearInterval(timer));
      }
      registerRoutes(app, {
        store,
        writes,
        tokenStore,
        contextReplayGuard: createPostgresContextTokenReplayGuard(pool),
        idempotency,
        defaultHouseholdId: cfg.defaultHouseholdId,
        cardStore,
        payableStore,
        budgetStore,
        goalStore,
        subscriptionStore,
        profileStore,
        pushStore,
        adoptionStore,
        ...(vapid?.publicKey ? { vapidPublicKey: vapid.publicKey } : {}),
        ...(pushDelivery ? { pushDelivery } : {}),
      });
    }
    app.addHook("onClose", async () => {
      await pool.end();
    });
  } else {
    app.log.info("using in-memory stores (no DATABASE_URL)");
    const { state, writes } = createInMemoryStores();
    const store = createInMemoryReadModelStoreFromState(state);
    const tokenStore = createInMemoryDeviceTokenStore();
    const cardStore = createInMemoryCardStore(state);
    const payableStore = createInMemoryPayableStore(state);
    const budgetStore = createInMemoryBudgetStore(state);
    const goalStore = createInMemoryGoalStore(state);
    const subscriptionState = {
      subscriptions: [] as import("../types/domain.js").Subscription[],
    };
    const subscriptionStore =
      createInMemorySubscriptionStore(subscriptionState);
    const profileStore = createInMemoryProfileStore();
    const pushStore = createInMemoryPushSubscriptionStore();
    const pushDelivery = vapid
      ? createWebPushDelivery({ store: pushStore, config: vapid })
      : undefined;
    registerRoutes(app, {
      store,
      writes,
      tokenStore,
      idempotency: createInMemoryIdempotencyStore(),
      cardStore,
      payableStore,
      budgetStore,
      goalStore,
      subscriptionStore,
      profileStore,
      pushStore,
      ...(vapid?.publicKey ? { vapidPublicKey: vapid.publicKey } : {}),
      ...(pushDelivery ? { pushDelivery } : {}),
    });
  }

  try {
    await app.listen({ port: cfg.port, host: cfg.host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

void start();
