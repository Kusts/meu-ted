import Fastify, { type FastifyInstance } from "fastify";
import { registerRoutes } from "../src/routes/index.js";
import { createInMemoryAuditLogStore, type AuditLogStore } from "../src/audit/store.js";
import type { OwnershipTransferStore } from "../src/auth/ownership-transfers-postgres.js";
import type { BetterAuth } from "../src/auth/better-auth.js";
import type { InviteService } from "../src/auth/invites.js";
import type { WorkspaceStore } from "../src/auth/workspaces-http.js";
import {
  createInMemoryReadModelStore,
  type ReadModelStore,
} from "../src/read-models/store.js";
import {
  createInMemoryStores,
  type InMemoryState,
} from "../src/writes/in-memory.js";
import { createInMemoryIdempotencyStore } from "../src/writes/idempotency.js";
import { type DeviceTokenStore } from "../src/auth/device-token.js";
import { registerCors } from "../src/server/cors.js";
import { HOUSEHOLD_A, HOUSEHOLD_B } from "./fixtures/seed.js";
import type { Account, Category, Transaction } from "../src/types/domain.js";
import { createInMemoryCardStore } from "../src/cards/in-memory.js";
import { createInMemoryPayableStore } from "../src/payables/in-memory.js";
import { createInMemoryBudgetStore } from "../src/budgets/in-memory.js";
import { createInMemoryGoalStore } from "../src/goals/in-memory.js";
import { createInMemorySubscriptionStore } from "../src/subscriptions/in-memory.js";
import { createInMemoryProfileStore } from "../src/profile/in-memory.js";
import { createInMemoryPushSubscriptionStore } from "../src/push/store.js";
import type { PushDelivery } from "../src/push/delivery.js";
import type { AdoptionStore } from "../src/observability/adoption.js";
import type { PendingOperationStore } from "../src/approvals/pending.js";
import { createUndoService } from "../src/approvals/undo.js";
export type TestAppOptions = {
  clock?: () => Date;
};

export type TestApp = {
  app: FastifyInstance;
  store: ReadModelStore;
  state: InMemoryState;
};

const createTestTokenStore = (): DeviceTokenStore => {
  const tokens = new Map<string, { deviceId: string; householdId: string }>();
  tokens.set("dev-token-1", {
    deviceId: "dev-device-1",
    householdId: HOUSEHOLD_A,
  });
  tokens.set("dev-token-2", {
    deviceId: "dev-device-2",
    householdId: HOUSEHOLD_B,
  });
  return {
    async resolve(token) {
      if (!token || token.trim() === "")
        throw Object.assign(new Error("missing"), {
          statusCode: 401,
          code: "auth.missing_token",
        });
      const ctx = tokens.get(token);
      if (!ctx)
        throw Object.assign(new Error("invalid"), {
          statusCode: 401,
          code: "auth.invalid_token",
        });
      return ctx;
    },
    async register(deviceName, householdId) {
      const tok = crypto.randomUUID();
      const devId = crypto.randomUUID();
      tokens.set(tok, { deviceId: devId, householdId });
      return { token: tok, deviceId: devId, householdId };
    },
    async revoke(token) {
      tokens.delete(token);
    },
  };
};

export const buildTestApp = (
  seed: {
    accounts?: Account[];
    categories?: Category[];
    transactions?: Transaction[];
  } = {},
  ...optional: unknown[]
): TestApp => {
  const { state, writes } = createInMemoryStores(seed);
  const clock = optional.find(
    (value): value is () => Date => {
      if (typeof value !== "function") return false;
      try {
        return (value as () => unknown)() instanceof Date;
      } catch {
        return false;
      }
    },
  );
  const store = createInMemoryReadModelStore({
    accounts: state.accounts,
    categories: state.categories,
    transactions: state.transactions,
    deletedTransactionIds: state.deletedTransactions,
  });
  const cardStore = createInMemoryCardStore(state);
  const payableStore = createInMemoryPayableStore(state, clock);
  const budgetStore = createInMemoryBudgetStore(state, clock);
  const goalStore = createInMemoryGoalStore(state);
  const subscriptionState = {
    subscriptions: [] as import("../src/types/domain.js").Subscription[],
  };
  const subscriptionStore = createInMemorySubscriptionStore(subscriptionState);
  const profileStore = createInMemoryProfileStore();
  const pushStore = createInMemoryPushSubscriptionStore();
  const pushDelivery = optional.find(
    (value): value is PushDelivery =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { sendToWorkspace?: unknown }).sendToWorkspace ===
        "function",
  );
  const adoptionStore = optional.find(
    (value): value is AdoptionStore =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { record?: unknown }).record === "function" &&
      typeof (value as { funnel?: unknown }).funnel === "function",
  );
  const pendingStore = optional.find(
    (value): value is PendingOperationStore =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { create?: unknown }).create === "function" &&
      typeof (value as { findByChatId?: unknown }).findByChatId === "function",
  );
  const auditLogsSeed = (seed as { auditLogs?: Parameters<typeof createInMemoryAuditLogStore>[0] }).auditLogs;
  const auditStore =
    auditLogsSeed !== undefined
      ? createInMemoryAuditLogStore(auditLogsSeed)
      : (optional.find(
          (value): value is AuditLogStore =>
            typeof value === "object" &&
            value !== null &&
            typeof (value as AuditLogStore).listAuditLogs === "function",
        ) ?? createInMemoryAuditLogStore());
  const undoService = createUndoService({ auditLogs: auditStore, writes });
  const ownershipTransferStore = optional.find(
    (value): value is OwnershipTransferStore =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as OwnershipTransferStore).create === "function" &&
      typeof (value as OwnershipTransferStore).accept === "function",
  );
  const auth = optional.find(
    (value): value is BetterAuth =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as BetterAuth).api === "object" &&
      typeof (value as BetterAuth).options === "object",
  );
  const inviteService = optional.find(
    (value): value is InviteService =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as InviteService).createInvite === "function" &&
      typeof (value as InviteService).acceptInvite === "function",
  );
  const authorizeInviteCreate = optional.find(
    (value): value is (input: { userId: string; householdId: string }) => Promise<boolean> =>
      typeof value === "function",
  );
  const workspaceStore = optional.find(
    (value): value is WorkspaceStore =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as WorkspaceStore).list === "function" &&
      typeof (value as WorkspaceStore).create === "function" &&
      typeof (value as WorkspaceStore).listMembers === "function",
  );
  const app = Fastify({ logger: false });
  registerCors(app);
  registerRoutes(app, {
    store,
    writes,
    tokenStore: createTestTokenStore(),
    idempotency: createInMemoryIdempotencyStore(),
    cardStore,
    payableStore,
    budgetStore,
    goalStore,
    subscriptionStore,
    profileStore,
    pushStore,
    vapidPublicKey: "test-vapid-public-key",
    ...(pushDelivery ? { pushDelivery } : {}),
    ...(pendingStore ? { pendingStore } : {}),
    ...(adoptionStore ? { adoptionStore } : {}),
    auditLogs: auditStore,
    undoService,
    ...(ownershipTransferStore ? { ownershipTransferStore } : {}),
    ...(auth ? { auth } : {}),
    ...(inviteService ? { inviteService } : {}),
    ...(authorizeInviteCreate ? { authorizeInviteCreate } : {}),
    ...(workspaceStore ? { workspaceStore } : {}),
    ...(clock ? { clock } : {}),
  });
  return { app, store, state };
};

export const TOKEN_A = "dev-token-1";
export const TOKEN_B = "dev-token-2";
