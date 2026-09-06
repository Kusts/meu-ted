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
import { createPostgresWorkspaceAccessStore } from "../auth/workspace-access.js";
import { createPostgresWorkspaceStore } from "../auth/workspaces-postgres.js";
import { createPostgresOwnershipTransferStore } from "../auth/ownership-transfers-postgres.js";
import { createHttpInviteDelivery } from "../auth/invite-delivery.js";
import { createSmtpInviteDelivery } from "../auth/invite-delivery-smtp.js";
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
import { createBetterAuth } from "../auth/better-auth.js";
import { createInMemoryPriceAlertStore } from "../price-alerts/store.js";
import { createInMemoryLlmConfigStore } from "../agent/llm-config-memory.js";
import { createPostgresLlmConfigStore } from "../agent/llm-config-postgres.js";
import { createPostgresAgentReplayStore } from "../auth/agent-connection-token-replay-postgres.js";
import { createInMemoryAgentReplayStore } from "../auth/agent-connection-token-replay.js";
import { registerCors } from "./cors.js";
import { createPostgresInviteRuntime, createPostgresAccountInviteRuntime } from "./production-routes.js";
import { createPostgresAccountInviteStore } from "../auth/account-invites-postgres.js";
import { createAccountInviteService } from "../auth/account-invites.js";

const start = async (): Promise<void> => {
  const cfg = loadConfig();
  const vapid = loadVapidConfig();
  const app = Fastify({ logger: true });
  registerCors(app);

  if (cfg.databaseUrl) {
    const pool = createPool({ connectionString: cfg.databaseUrl });
    // Migrations must complete BEFORE createBetterAuth: better-auth performs
    // a schema check at boot and caches the verdict, so migrating afterwards
    // leaves a pre-migration mismatch cached until a manual restart.
    const isLegacySchema = process.env.DB_SCHEMA === "legacy";
    const migrationResult = await runMigrations(pool, isLegacySchema);
    if (isLegacySchema) {
      app.log.info(
        { legacyMigrations: migrationResult.applied },
        "legacy-safe migrations applied",
      );
    } else {
      app.log.info(
        { database: "postgres", appliedMigrations: migrationResult.applied },
        "using postgres stores",
      );
    }
    const { createPostgresInviteSignupGuard } = await import("../auth/invite-signup-guard.js");
    const inviteSignupGuard = createPostgresInviteSignupGuard(pool);
    const auth = createBetterAuth({
      pool,
      secret: cfg.betterAuthSecret,
      baseURL: cfg.betterAuthUrl,
      trustedOrigins: cfg.trustedOrigins,
      // Invite-restricted signup: Better-Auth's global disableSignUp is opened,
      // but the route guard in better-auth-http enforces “pending invite required” (403).
      disableSignUp: false,
    });
    const workspaceAccess = createPostgresWorkspaceAccessStore(pool);
    const workspaceStore = createPostgresWorkspaceStore(pool);
    const ownershipTransferStore = createPostgresOwnershipTransferStore(pool);
    const inviteDelivery = (() => {
      if (cfg.smtpHost && cfg.smtpFrom && cfg.inviteAcceptUrl) {
        return createSmtpInviteDelivery({
          host: cfg.smtpHost,
          port: cfg.smtpPort ?? 587,
          ...(cfg.smtpUser ? { user: cfg.smtpUser } : {}),
          ...(cfg.smtpPass ? { pass: cfg.smtpPass } : {}),
          from: cfg.smtpFrom,
          acceptUrlBase: cfg.inviteAcceptUrl,
          secure: cfg.smtpSecure,
        });
      }
      if (cfg.inviteDeliveryUrl && cfg.inviteDeliveryToken) {
        return createHttpInviteDelivery({
          endpoint: cfg.inviteDeliveryUrl,
          bearerToken: cfg.inviteDeliveryToken,
        });
      }
      return undefined;
    })();
    const inviteRuntime = createPostgresInviteRuntime({
      pool,
      workspaceAccess,
      delivery: inviteDelivery,
    });
    const accountInviteService = createAccountInviteService({
      store: createPostgresAccountInviteStore(pool),
      deliver: inviteDelivery ?? (async () => {
        throw new Error("invite delivery is not configured");
      }),
    });
    const accountInviteRuntime = { accountInviteService };

    if (process.env.DB_SCHEMA === "legacy") {
      app.log.info("using legacy pi_financeiro schema adapters");
      const store = createLegacyPostgresReadModelStore({ pool });
      const writes = createLegacyPostgresWriteStore({ pool });
      const tokenStore = createPostgresDeviceTokenStore(pool);
      const idempotency = createPostgresIdempotencyStore({ pool, legacy: true });
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
        priceAlertStore: createInMemoryPriceAlertStore(),
        auth,
        adminEmails: cfg.adminEmails,
        workspaceAccess,
        workspaceStore,
        ownershipTransferStore,
        ...inviteRuntime,
        ...accountInviteRuntime,
        inviteSignupGuard,
        llmConfigStore: createPostgresLlmConfigStore(pool),
        agentConnectionSecret: cfg.agentConnectionSecret,
        agentConfigToken: cfg.agentConfigToken,
        agentAuthServiceToken: cfg.agentAuthServiceToken,
        agentReplayStore: createPostgresAgentReplayStore(pool),
        agentRuntimeOrigin: cfg.agentRuntimeOrigin,
        agentRuntimeAdminToken: cfg.agentRuntimeAdminToken,
        trustedOrigins: cfg.trustedOrigins,
        disableDeviceRegistration: cfg.disableDeviceRegistration,
        pool,
        ...(vapid?.publicKey ? { vapidPublicKey: vapid.publicKey } : {}),
        ...(pushDelivery ? { pushDelivery } : {}),
      });
    } else {
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
        priceAlertStore: createInMemoryPriceAlertStore(),
        adoptionStore,
        auth,
        adminEmails: cfg.adminEmails,
        workspaceAccess,
        workspaceStore,
        ownershipTransferStore,
        ...inviteRuntime,
        ...accountInviteRuntime,
        inviteSignupGuard,
        llmConfigStore: createPostgresLlmConfigStore(pool),
        agentConnectionSecret: cfg.agentConnectionSecret,
        agentConfigToken: cfg.agentConfigToken,
        agentAuthServiceToken: cfg.agentAuthServiceToken,
        agentReplayStore: createPostgresAgentReplayStore(pool),
        agentRuntimeOrigin: cfg.agentRuntimeOrigin,
        agentRuntimeAdminToken: cfg.agentRuntimeAdminToken,
        trustedOrigins: cfg.trustedOrigins,
        disableDeviceRegistration: cfg.disableDeviceRegistration,
        pool,
        ...(vapid?.publicKey ? { vapidPublicKey: vapid.publicKey } : {}),
        ...(pushDelivery ? { pushDelivery } : {}),
      });
    }
    app.addHook("onClose", async () => {
      await auth.close();
      await pool.end();
    });
  } else {
    app.log.info("using in-memory stores (no DATABASE_URL)");
    const { memoryAdapter } = await import("better-auth/adapters/memory");
    const auth = createBetterAuth({
      database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
      secret: cfg.betterAuthSecret,
      baseURL: cfg.betterAuthUrl,
      trustedOrigins: cfg.trustedOrigins,
      disableSignUp: cfg.disableSignUp,
      transaction: false,
    });
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
    const priceAlertStore = createInMemoryPriceAlertStore();
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
      priceAlertStore,
      auth,
      adminEmails: cfg.adminEmails,
      llmConfigStore: createInMemoryLlmConfigStore(),
      agentConnectionSecret: cfg.agentConnectionSecret,
      agentConfigToken: cfg.agentConfigToken,
      agentAuthServiceToken: cfg.agentAuthServiceToken,
      agentReplayStore: createInMemoryAgentReplayStore(),
      agentRuntimeOrigin: cfg.agentRuntimeOrigin,
      agentRuntimeAdminToken: cfg.agentRuntimeAdminToken,
      trustedOrigins: cfg.trustedOrigins,
      disableDeviceRegistration: cfg.disableDeviceRegistration,
      ...(vapid?.publicKey ? { vapidPublicKey: vapid.publicKey } : {}),
      ...(pushDelivery ? { pushDelivery } : {}),
    });
    app.addHook("onClose", async () => {
      await auth.close();
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
