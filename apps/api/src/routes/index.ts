import type { FastifyInstance } from "fastify";
import { type ReadModelStore } from "../read-models/store.js";
import {
  type DeviceTokenStore,
  createInMemoryDeviceTokenStore,
  AuthError,
  DEVICE_TOKEN_HEADER,
} from "../auth/device-token.js";
import { type WriteStore } from "../writes/store.js";
import {
  type IdempotencyStore,
  createInMemoryIdempotencyStore,
  requireIdempotencyKey,
} from "../writes/idempotency.js";
import type { AuthResolver } from "./auth.js";
import type { ContextTokenReplayGuard } from "../auth/context-token-replay.js";
import { CONTEXT_TOKEN_HEADER, validateContextToken } from "../auth/context-token.js";
import { createInMemoryContextTokenReplayGuard } from "../auth/context-token-replay-memory.js";
import type { CardStore } from "../cards/store.js";
import type { PayableStore } from "../payables/store.js";
import type { BudgetStore } from "../budgets/store.js";
import type { GoalStore } from "../goals/store.js";
import type { SubscriptionStore } from "../subscriptions/store.js";
import type { ProfileStore } from "../profile/store.js";
import type { PendingOperationExecutor, PendingOperationStore } from "../approvals/pending.js";
import { createInMemoryPendingOperationStore } from "../approvals/pending.js";
import type { PushSubscriptionStore } from "../push/store.js";
import type { PushDelivery } from "../push/delivery.js";
import {
  createInMemoryAdoptionStore,
  type AdoptionStore,
} from "../observability/adoption.js";
import { registerAuthRoutes } from "./auth.js";
import { registerPendingOperationRoutes } from "./pending-operations.js";
import { registerAccountRoutes } from "./accounts.js";
import { registerCategoryRoutes } from "./categories.js";
import { registerTransactionRoutes } from "./transactions.js";
import { registerTransactionWriteRoutes } from "./transactions-write.js";
import { registerDashboardRoutes } from "./dashboard.js";
import { registerInsightRoutes } from "./insights.js";
import { registerProfileRoutes } from "./profile.js";
import { registerCardRoutes } from "./cards.js";
import { registerPayableRoutes } from "./payables.js";
import { registerBudgetRoutes } from "./budgets.js";
import { registerGoalRoutes } from "./goals.js";
import { registerSubscriptionRoutes } from "./subscriptions.js";
import { registerPushRoutes } from "./push.js";
import { registerAdoptionRoutes } from "./adoption.js";
import { registerAuditRoutes } from "./audit.js";
import { registerOwnershipTransferRoutes } from "../auth/ownership-transfers-http.js";
import type { AuditLogStore } from "../audit/store.js";
import { createInMemoryAuditLogStore } from "../audit/store.js";
import type { OwnershipTransferStore } from "../auth/ownership-transfers-postgres.js";
import { registerBetterAuthRoutes } from "../auth/better-auth-http.js";
import { registerInviteRoutes } from "../auth/invites-http.js";
import { registerWorkspaceRoutes } from "../auth/workspaces-http.js";
import type { BetterAuth } from "../auth/better-auth.js";
import type { InviteService } from "../auth/invites.js";
import type { WorkspaceStore } from "../auth/workspaces-http.js";

export type RouteDeps = {
  store: ReadModelStore;
  writes: WriteStore;
  tokenStore?: DeviceTokenStore;
  contextReplayGuard?: ContextTokenReplayGuard;
  idempotency?: IdempotencyStore;
  pendingStore?: PendingOperationStore;
  pendingExecutor?: PendingOperationExecutor;
  undoService?: import('../approvals/undo.js').UndoService;
  defaultHouseholdId?: string;
  cardStore?: CardStore;
  payableStore?: PayableStore;
  budgetStore?: BudgetStore;
  goalStore?: GoalStore;
  subscriptionStore?: SubscriptionStore;
  profileStore?: ProfileStore;
  pushStore?: PushSubscriptionStore;
  pushDelivery?: PushDelivery;
  adoptionStore?: AdoptionStore;
  vapidPublicKey?: string;
  auditLogs?: AuditLogStore;
  ownershipTransferStore?: OwnershipTransferStore;
  auth?: BetterAuth;
  inviteService?: InviteService;
  authorizeInviteCreate?: (input: { userId: string; householdId: string }) => Promise<boolean>;
  workspaceStore?: WorkspaceStore;
  clock?: () => Date;
};

export const registerRoutes = (app: FastifyInstance, deps: RouteDeps): void => {
  const tokenStore = deps.tokenStore ?? createInMemoryDeviceTokenStore();
  const contextReplayGuard = deps.contextReplayGuard ?? createInMemoryContextTokenReplayGuard();
  const idempotency = deps.idempotency ?? createInMemoryIdempotencyStore();
  const resolveToken: AuthResolver = async (token) => tokenStore.resolve(token);
  const clock = deps.clock ?? (() => new Date());
  app.addHook("preHandler", async (request) => {
    const rawHeader = request.headers[CONTEXT_TOKEN_HEADER];
    if (rawHeader === undefined) return;
    const contextToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    if (contextToken === undefined) return;

    let claims: Awaited<ReturnType<typeof validateContextToken>>;
    try {
      claims = await validateContextToken(
        contextToken,
        process.env.PI_CONTEXT_TOKEN_SECRET ?? "",
      );
    } catch {
      throw new AuthError("invalid bridge context token", 401, "auth.context_token_invalid");
    }

    const deviceHeader = request.headers[DEVICE_TOKEN_HEADER];
    const deviceToken = Array.isArray(deviceHeader) ? deviceHeader[0] : deviceHeader;
    const deviceContext = await resolveToken(deviceToken);
    if (deviceContext.householdId !== claims.workspaceId) {
      throw new AuthError("context workspace does not match device", 403, "auth.context_workspace_mismatch");
    }

    const accepted = await contextReplayGuard.claim({
      jti: claims.jti,
      workspaceId: claims.workspaceId,
      requestId: claims.requestId,
      providerMessageId: claims.providerMessageId,
      expiresAt: new Date(claims.expiresAt * 1_000),
    });
    if (!accepted) {
      throw new AuthError("invalid bridge context binding", 401, "auth.context_token_invalid");
    }
    request.contextToken = contextToken;
    request.contextClaims = claims;
  });

  // G2.2.4 — centralized idempotency-key validation for mutating methods.
  // Validates the header when present (legacy clients without it keep working).
  app.addHook("preHandler", async (req) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      requireIdempotencyKey(req.headers);
    }
  });

  app.get("/health", async () => ({ status: "ok" }));
  registerPendingOperationRoutes(app, {
    store: deps.pendingStore ?? createInMemoryPendingOperationStore(),
    resolveToken,
    ...(deps.pendingExecutor ? { executor: deps.pendingExecutor } : {}),
    ...(deps.undoService ? { undoService: deps.undoService } : {}),
  });
  registerAdoptionRoutes(app, {
    store: deps.adoptionStore ?? createInMemoryAdoptionStore(),
    resolveToken,
  });
  const authOpts: Parameters<typeof registerAuthRoutes>[1] = {
    resolveToken,
    tokenStore,
  };
  if (deps.defaultHouseholdId !== undefined)
    authOpts.defaultHouseholdId = deps.defaultHouseholdId;
  registerAuthRoutes(app, authOpts);
  registerAccountRoutes(app, {
    store: deps.store,
    writes: deps.writes,
    resolveToken,
    idempotency,
  });
  registerCategoryRoutes(app, {
    store: deps.store,
    writes: deps.writes,
    resolveToken,
    idempotency,
  });
  registerTransactionRoutes(app, { store: deps.store, resolveToken });
  registerTransactionWriteRoutes(app, {
    store: deps.store,
    writes: deps.writes,
    resolveToken,
    idempotency,
  });
  registerDashboardRoutes(app, { store: deps.store, resolveToken, clock });
  registerInsightRoutes(app, { store: deps.store, resolveToken });
  if (deps.profileStore) {
    registerProfileRoutes(app, {
      resolveToken,
      profileStore: deps.profileStore,
    });
  }
  if (deps.cardStore) {
    registerCardRoutes(app, {
      cardStore: deps.cardStore,
      resolveToken,
      idempotency,
    });
  }
  if (deps.payableStore) {
    registerPayableRoutes(app, {
      payableStore: deps.payableStore,
      resolveToken,
      idempotency,
    });
  }
  if (deps.budgetStore) {
    registerBudgetRoutes(app, {
      budgetStore: deps.budgetStore,
      resolveToken,
      idempotency,
    });
  }
  if (deps.goalStore) {
    registerGoalRoutes(app, {
      goalStore: deps.goalStore,
      resolveToken,
      idempotency,
    });
  }
  if (deps.subscriptionStore) {
    registerSubscriptionRoutes(app, {
      subscriptionStore: deps.subscriptionStore,
      resolveToken,
      idempotency,
    });
  }
  if (deps.pushStore) {
    registerPushRoutes(app, {
      pushStore: deps.pushStore,
      idempotency,
      resolveToken,
      ...(deps.vapidPublicKey ? { vapidPublicKey: deps.vapidPublicKey } : {}),
      ...(deps.pushDelivery ? { delivery: deps.pushDelivery } : {}),
      ...(deps.adoptionStore ? { adoption: deps.adoptionStore } : {}),
    });
  }
  registerAuditRoutes(app, { auditLogs: deps.auditLogs ?? createInMemoryAuditLogStore() });
  if (deps.ownershipTransferStore) {
    registerOwnershipTransferRoutes(app, deps.ownershipTransferStore);
  }
  if (deps.auth) {
    registerBetterAuthRoutes(app, deps.auth);
    if (deps.inviteService && deps.authorizeInviteCreate) {
      registerInviteRoutes(app, {
        auth: deps.auth,
        service: deps.inviteService,
        authorizeCreate: deps.authorizeInviteCreate,
      });
    }
    if (deps.workspaceStore) {
      registerWorkspaceRoutes(app, { auth: deps.auth, store: deps.workspaceStore });
    }
  }
};
