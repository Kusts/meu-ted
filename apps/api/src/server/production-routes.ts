import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createPostgresDeviceTokenStore } from "../auth/device-token.js";
import type { InviteDelivery } from "../auth/invites.js";
import { createPostgresBudgetStore } from "../budgets/postgres.js";
import { createLegacyPostgresCardStore } from "../cards/legacy-postgres.js";
import { createPostgresCardStore } from "../cards/postgres.js";
import { createLegacyPostgresGoalStore } from "../goals/legacy-postgres.js";
import { createPostgresGoalStore } from "../goals/postgres.js";
import { createLegacyPostgresPayableStore } from "../payables/legacy-postgres.js";
import { createPostgresPayableStore } from "../payables/postgres.js";
import { createPostgresProfileStore } from "../profile/postgres.js";
import { createWebPushDelivery } from "../push/delivery.js";
import { createPostgresPushSubscriptionStore } from "../push/postgres.js";
import type { VapidConfig } from "../push/vapid.js";
import { createLegacyPostgresReadModelStore } from "../read-models/legacy-postgres-store.js";
import { createPostgresReadModelStore } from "../read-models/postgres-store.js";
import { registerRoutes } from "../routes/index.js";
import { createLegacyPostgresSubscriptionStore } from "../subscriptions/legacy-postgres.js";
import { createPostgresSubscriptionStore } from "../subscriptions/postgres.js";
import { createLegacyPostgresWriteStore } from "../writes/legacy-postgres.js";
import {
  createPostgresIdempotencyStore,
  createPostgresWriteStore,
} from "../writes/postgres.js";
import { createLegacyPostgresAuditLogStore, createPostgresAuditLogStore } from "../audit/store.js";
import { createInviteService } from "../auth/invites.js";
import { createPostgresInviteStore } from "../auth/invites-postgres.js";
import type { createBetterAuth } from "../auth/better-auth.js";

type BetterAuth = ReturnType<typeof createBetterAuth>;

export const registerPostgresProductionRoutes = (
  app: FastifyInstance,
  pool: Pool,
  legacy: boolean,
  defaultHouseholdId: string,
  betterAuth?: BetterAuth,
  inviteDelivery?: InviteDelivery,
  vapid?: VapidConfig,
): void => {
  const pushStore = createPostgresPushSubscriptionStore(pool);
  const pushDelivery = vapid
    ? createWebPushDelivery({ store: pushStore, config: vapid })
    : undefined;
  const vapidPublicKey = vapid?.publicKey;

  const inviteService = betterAuth && inviteDelivery
    ? createInviteService({ store: createPostgresInviteStore(pool), deliver: inviteDelivery })
    : undefined;
  const authorizeInviteCreate = betterAuth
    ? async (_input: { userId: string; householdId: string }) => true
    : undefined;

  if (legacy) {
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
    const auditLogs = createLegacyPostgresAuditLogStore(pool);
    registerRoutes(app, {
      store,
      writes,
      tokenStore,
      idempotency,
      defaultHouseholdId,
      cardStore,
      payableStore,
      budgetStore,
      goalStore,
      subscriptionStore,
      profileStore,
      pushStore,
      auditLogs,
      disableDeviceRegistration: true,
      ...(betterAuth ? { auth: betterAuth } : {}),
      ...(inviteService ? { inviteService } : {}),
      ...(authorizeInviteCreate ? { authorizeInviteCreate } : {}),
      ...(pushDelivery ? { pushDelivery } : {}),
      ...(vapidPublicKey ? { vapidPublicKey } : {}),
    });
    return;
  }

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
  const auditLogs = createPostgresAuditLogStore(pool);
  registerRoutes(app, {
    store,
    writes,
    tokenStore,
    idempotency,
    defaultHouseholdId,
    cardStore,
    payableStore,
    budgetStore,
    goalStore,
    subscriptionStore,
    profileStore,
    pushStore,
    auditLogs,
    disableDeviceRegistration: true,
    ...(betterAuth ? { auth: betterAuth } : {}),
    ...(inviteService ? { inviteService } : {}),
    ...(authorizeInviteCreate ? { authorizeInviteCreate } : {}),
    ...(pushDelivery ? { pushDelivery } : {}),
    ...(vapidPublicKey ? { vapidPublicKey } : {}),
  });
};
