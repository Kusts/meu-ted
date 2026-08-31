import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createPostgresDeviceTokenStore } from "../auth/device-token.js";
import type { InviteDelivery, InviteService } from "../auth/invites.js";
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
import { InviteError, createInviteService } from "../auth/invites.js";
import { createPostgresInviteStore } from "../auth/invites-postgres.js";
import { createPostgresWorkspaceStore } from "../auth/workspaces-postgres.js";
import { createPostgresWorkspaceAccessStore } from "../auth/workspace-access.js";
import { createPostgresOwnershipTransferStore } from "../auth/ownership-transfers-postgres.js";
import type { createBetterAuth } from "../auth/better-auth.js";
import type { WorkspaceAccessStore } from "../auth/workspace-access.js";

type BetterAuth = ReturnType<typeof createBetterAuth>;

export type PostgresInviteRuntime = {
  inviteService?: InviteService;
  authorizeInviteCreate?: (input: { userId: string; householdId: string }) => Promise<boolean>;
};

export const createPostgresInviteRuntime = (input: {
  pool: Pool;
  workspaceAccess?: WorkspaceAccessStore | undefined;
  delivery?: InviteDelivery | undefined;
}): PostgresInviteRuntime => {
  const { workspaceAccess, delivery } = input;
  if (!workspaceAccess) return {};

  const deliver = delivery ?? (async () => {
    throw new InviteError(
      "invite delivery is not configured",
      "invite.delivery_unavailable",
      503,
    );
  });

  const inviteService = createInviteService({
    store: createPostgresInviteStore(input.pool),
    deliver,
  });

  return {
    inviteService,
    authorizeInviteCreate: async ({ userId, householdId }) => {
      const access = await workspaceAccess.resolve(userId, householdId);
      return access?.kind === "shared" && access.role === "owner";
    },
  };
};

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

  const workspaceAccess = betterAuth ? createPostgresWorkspaceAccessStore(pool) : undefined;
  const workspaceStore = betterAuth ? createPostgresWorkspaceStore(pool) : undefined;
  const ownershipTransferStore = betterAuth ? createPostgresOwnershipTransferStore(pool) : undefined;
  const inviteRuntime = betterAuth
    ? createPostgresInviteRuntime({ pool, workspaceAccess, delivery: inviteDelivery })
    : {};

  if (legacy) {
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
      ...(workspaceAccess ? { workspaceAccess } : {}),
      ...(workspaceStore ? { workspaceStore } : {}),
      ...(ownershipTransferStore ? { ownershipTransferStore } : {}),
      ...inviteRuntime,
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
    ...(workspaceAccess ? { workspaceAccess } : {}),
    ...(workspaceStore ? { workspaceStore } : {}),
    ...(ownershipTransferStore ? { ownershipTransferStore } : {}),
    ...inviteRuntime,
    ...(pushDelivery ? { pushDelivery } : {}),
    ...(vapidPublicKey ? { vapidPublicKey } : {}),
  });
};
