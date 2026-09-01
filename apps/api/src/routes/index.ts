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
import {
  createInMemoryShadowDivergenceStore,
  type ShadowDivergenceStore,
} from "../observability/shadow-divergence.js";
import {
  createInMemoryPhoneWorkspaceStore,
  type PhoneWorkspaceStore,
} from "../auth/phone-workspace.js";
import { registerShadowObservabilityRoutes } from "./shadow-observability.js";
import { registerBridgeContextRoutes } from "./bridge-context.js";
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
import { registerDuplicateDetectRoutes } from "./duplicate-detect.js";
import { registerOwnershipTransferRoutes } from "../auth/ownership-transfers-http.js";
import type { OwnershipTransferStore } from "../auth/ownership-transfers-postgres.js";
import type { AuditLogStore } from "../audit/store.js";
import { createInMemoryAuditLogStore } from "../audit/store.js";
import { registerBetterAuthRoutes } from "../auth/better-auth-http.js";
import { registerInviteRoutes } from "../auth/invites-http.js";
import { registerWorkspaceRoutes } from "../auth/workspaces-http.js";
import { registerAdminInviteRoutes } from "./admin-invites.js";
import type { AdminInviteDelivery } from "../auth/admin-invite-service.js";
import type { BetterAuth } from "../auth/better-auth.js";
import type { InviteService } from "../auth/invites.js";
import type { WorkspaceStore } from "../auth/workspaces-http.js";

import type { WorkspaceAccessStore } from "../auth/workspace-access.js";
import { getBetterAuthSessionContext } from "../auth/better-auth.js";
import { createInMemoryPriceAlertStore, type PriceAlertStore } from "../price-alerts/store.js";
import { registerPriceAlertRoutes } from "./price-alerts.js";
import { registerAgentAuthRoutes } from "./agent-auth.js";
import { registerAdminAgentLlmConfigRoutes } from "./admin-agent-llm-config.js";
import { registerInternalAgentLlmConfigRoutes } from "./internal-agent-llm-config.js";
import { registerAgentLlmRelayRoutes } from "./internal-agent-llm-relay.js";
import { createInMemoryLlmConfigStore } from "../agent/llm-config-postgres.js";
import type { LlmConfigStore } from "../agent/llm-config-postgres.js";
import { createInMemoryAgentReplayStore, type AgentReplayStore } from "../auth/agent-connection-token-replay.js";

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
  shadowDivergenceStore?: ShadowDivergenceStore;
  phoneWorkspaceStore?: PhoneWorkspaceStore;
  delegationSecret?: string;
  vapidPublicKey?: string;
  auditLogs?: AuditLogStore;
  ownershipTransferStore?: OwnershipTransferStore;
  auth?: BetterAuth;
  workspaceAccess?: WorkspaceAccessStore;
  inviteService?: InviteService;
  authorizeInviteCreate?: (input: { userId: string; householdId: string }) => Promise<boolean>;
  workspaceStore?: WorkspaceStore;
  adminEmails?: string[];
  adminInviteDelivery?: AdminInviteDelivery;
  disableDeviceRegistration?: boolean;
  approvalPolicy?: import('../approvals/policy.js').ApprovalPolicy;
  clock?: () => Date;
  priceAlertStore?: PriceAlertStore;
  llmConfigStore?: LlmConfigStore;
  agentConnectionSecret?: string;
  agentConfigToken?: string;
  agentAuthServiceToken?: string;
  agentReplayStore?: AgentReplayStore;
  agentRuntimeOrigin?: string;
  agentRuntimeAdminToken?: string;
  trustedOrigins?: string[];
  inviteSignupGuard?: import('../auth/invite-signup-guard.js').InviteSignupGuard;
};


export const registerRoutes = (app: FastifyInstance, deps: RouteDeps): void => {
  const tokenStore = deps.tokenStore ?? createInMemoryDeviceTokenStore();
  const contextReplayGuard = deps.contextReplayGuard ?? createInMemoryContextTokenReplayGuard();
  const idempotency = deps.idempotency ?? createInMemoryIdempotencyStore();
  const pendingStore = deps.pendingStore ?? createInMemoryPendingOperationStore();
  const resolveToken: AuthResolver = async (token) => tokenStore.resolve(token);
  const clock = deps.clock ?? (() => new Date());

  if (deps.auth && deps.workspaceAccess) {
    const auth = deps.auth;
    const workspaceAccess = deps.workspaceAccess;
    app.addHook("preHandler", async (request, reply) => {
      const workspaceIdHeader = request.headers['x-workspace-id'];
      const workspaceId = Array.isArray(workspaceIdHeader) ? workspaceIdHeader[0] : workspaceIdHeader;
      if (!workspaceId) return;

      const headers = new Headers();
      for (const [key, val] of Object.entries(request.headers)) {
        if (val !== undefined) headers.set(key, Array.isArray(val) ? val.join(', ') : val);
      }
      const session = await getBetterAuthSessionContext(auth, headers);
      if (!session) return;

      const access = await workspaceAccess.resolve(session.userId, workspaceId);
      if (!access) {
        return reply.code(403).send({ code: 'auth.workspace_forbidden', message: 'Acesso ao workspace proibido.' });
      }

      request.betterAuthContext = session;
      request.workspaceAccess = access;
      request.authenticatedContext = {
        householdId: access.householdId,
        actorId: access.userId,
        authUserId: session.userId,
        actorType: 'user',
        deviceId: '',
        role: access.role,
      };
    });
  }

  if (deps.delegationSecret || process.env.PI_DELEGATED_TOKEN_SECRET) {
    const delegationSecret = deps.delegationSecret ?? process.env.PI_DELEGATED_TOKEN_SECRET ?? "";
    app.addHook("preHandler", async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) return;
      const token = authHeader.slice("Bearer ".length).trim();
      // Only treat as delegated when the payload declares the delegation
      // issuer; session tokens from Better Auth must keep flowing to the
      // normal session/device resolution path.
      let headerPayload: string | undefined;
      try {
        const [, payload] = token.split(".");
        if (payload) {
          const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { iss?: string };
          if (json.iss === "pi-agent") headerPayload = payload;
        }
      } catch {
        headerPayload = undefined;
      }
      if (!headerPayload) return;

      let claims: import("../auth/delegated-token.js").DelegatedTurnClaims;
      try {
        const { verifyDelegatedTurnToken } = await import("../auth/delegated-token.js");
        claims = await verifyDelegatedTurnToken(token, delegationSecret, Date.now());
      } catch (err) {
        return reply.code(401).send({ code: "auth.invalid_token", message: (err as Error).message });
      }

      const isRead = request.method === "GET" || request.method === "HEAD";
      const requiredCapability = isRead ? "financial.read" : "financial.write";
      if (!claims.capabilities.includes(requiredCapability)) {
        return reply.code(403).send({ code: "auth.delegation_scope_forbidden", message: "Permissão insuficiente no token delegado." });
      }

      if (deps.workspaceAccess) {
        const access = await deps.workspaceAccess.resolve(claims.sub, claims.workspace);
        if (!access) {
          return reply.code(403).send({ code: "auth.workspace_forbidden", message: "Acesso ao workspace revogado ou inexistente." });
        }
      }

      request.authenticatedContext = {
        householdId: claims.workspace,
        actorId: claims.sub,
        authUserId: claims.sub,
        actorType: "user",
        deviceId: "",
        role: claims.role,
      };
    });
  }

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
      if (
        req.url.startsWith('/auth/') ||
        req.url.startsWith('/api/auth') ||
        req.url.startsWith('/bridge/') ||
        req.url === '/health'
      ) {
        return;
      }
      if (req.headers['idempotency-key'] !== undefined || req.headers['Idempotency-Key'] !== undefined) {
        requireIdempotencyKey(req.headers);
      }
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

  registerShadowObservabilityRoutes(app, {
    shadowDivergence: deps.shadowDivergenceStore ?? createInMemoryShadowDivergenceStore(),
    resolveToken,
  });
  registerBridgeContextRoutes(app, {
    phoneWorkspace: deps.phoneWorkspaceStore ?? createInMemoryPhoneWorkspaceStore(),
    delegationSecret: deps.delegationSecret ?? process.env.PI_DELEGATION_SECRET ?? "default-delegation-secret-for-tests",
  });
  const authOpts: Parameters<typeof registerAuthRoutes>[1] = {
    resolveToken,
    tokenStore,
    disableDeviceRegistration: deps.disableDeviceRegistration ?? false,
    ...(deps.auth ? { auth: deps.auth } : {}),
    ...(deps.workspaceAccess ? { workspaceAccess: deps.workspaceAccess } : {}),
  };
  if (deps.defaultHouseholdId !== undefined)
    authOpts.defaultHouseholdId = deps.defaultHouseholdId;
  registerAuthRoutes(app, authOpts);

  registerAccountRoutes(app, {
    store: deps.store,
    writes: deps.writes,
    resolveToken,
    idempotency,
    ...(deps.approvalPolicy ? { approvalPolicy: deps.approvalPolicy, pendingStore } : {}),
  });
  registerCategoryRoutes(app, {
    store: deps.store,
    writes: deps.writes,
    resolveToken,
    idempotency,
    ...(deps.approvalPolicy ? { approvalPolicy: deps.approvalPolicy, pendingStore } : {}),
  });
  registerTransactionRoutes(app, { store: deps.store, resolveToken });
  registerTransactionWriteRoutes(app, {
    store: deps.store,
    writes: deps.writes,
    resolveToken,
    idempotency,
  });
  registerDashboardRoutes(app, { store: deps.store, resolveToken, clock });
  registerInsightRoutes(app, {
    store: deps.store,
    resolveToken,
    ...(deps.payableStore ? { payableStore: deps.payableStore } : {}),
    ...(deps.cardStore ? { cardStore: deps.cardStore } : {}),
    clock,
  });
  if (deps.profileStore) {
    registerProfileRoutes(app, {
      resolveToken,
      profileStore: deps.profileStore,
      ...(deps.adminEmails ? { adminEmails: deps.adminEmails } : {}),
      ...(deps.auth
? {
              resolveSessionEmail: async (headers: Headers) => {
                const session = await getBetterAuthSessionContext(deps.auth as BetterAuth, headers).catch(() => undefined);
                return session?.email;
              },
            }
        : {}),
    });
  }
  if (deps.cardStore) {
    registerCardRoutes(app, {
      cardStore: deps.cardStore,
      resolveToken,
      idempotency,
      ...(deps.approvalPolicy ? { approvalPolicy: deps.approvalPolicy, pendingStore } : {}),
    });
  }
  if (deps.payableStore) {
    registerPayableRoutes(app, {
      payableStore: deps.payableStore,
      resolveToken,
      idempotency,
      ...(deps.approvalPolicy ? { approvalPolicy: deps.approvalPolicy, pendingStore } : {}),
    });
  }
  if (deps.budgetStore) {
    registerBudgetRoutes(app, {
      budgetStore: deps.budgetStore,
      resolveToken,
      idempotency,
      ...(deps.approvalPolicy ? { approvalPolicy: deps.approvalPolicy, pendingStore } : {}),
    });
  }
  if (deps.goalStore) {
    registerGoalRoutes(app, {
      goalStore: deps.goalStore,
      resolveToken,
      idempotency,
      ...(deps.approvalPolicy ? { approvalPolicy: deps.approvalPolicy, pendingStore } : {}),
    });
  }
  if (deps.subscriptionStore) {
    registerSubscriptionRoutes(app, {
      subscriptionStore: deps.subscriptionStore,
      resolveToken,
      idempotency,
      ...(deps.approvalPolicy ? { approvalPolicy: deps.approvalPolicy, pendingStore } : {}),
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
  // Price alerts — always registered (in-memory default, household-isolated)
  registerPriceAlertRoutes(app, {
    priceAlertStore: deps.priceAlertStore ?? createInMemoryPriceAlertStore(),
    resolveToken,
  });
  registerAuditRoutes(app, {
    auditLogs: deps.auditLogs ?? createInMemoryAuditLogStore(),
    resolveToken,
    ...(deps.undoService ? { undoService: deps.undoService } : {}),
  });
  registerDuplicateDetectRoutes(app, { resolveToken });
  if (deps.ownershipTransferStore) {
    registerOwnershipTransferRoutes(app, deps.ownershipTransferStore);
  }
  const llmStore = deps.llmConfigStore ?? createInMemoryLlmConfigStore();
  registerInternalAgentLlmConfigRoutes(app, {
    store: llmStore,
    configToken: deps.agentConfigToken ?? process.env.AGENT_CONFIG_TOKEN ?? 'dev-agent-config-token-32-chars-minimum!',
  });

  const replayStore = deps.agentReplayStore ?? createInMemoryAgentReplayStore();
  const agentServiceToken = deps.agentAuthServiceToken ?? process.env.AGENT_AUTH_SERVICE_TOKEN ?? 'dev-agent-auth-service-token-32-chars!';

  registerAgentAuthRoutes(app, {
    auth: deps.auth,
    workspaceAccess: deps.workspaceAccess,
    connectionSecret: deps.agentConnectionSecret ?? process.env.AGENT_CONNECTION_TOKEN_SECRET ?? 'dev-agent-connection-secret-at-least-32-chars!',
    agentAuthServiceToken: agentServiceToken,
    replayStore,
  });

  registerAgentLlmRelayRoutes(app, {
    adminToken: deps.agentRuntimeAdminToken ?? process.env.AGENT_RUNTIME_ADMIN_TOKEN ?? 'dev-agent-runtime-admin-token-32-chars!',
    ...(process.env.OPENCODE_ZEN_API_KEY ? { zenApiKey: process.env.OPENCODE_ZEN_API_KEY } : {}),
  });

  if (deps.auth) {
    registerAdminAgentLlmConfigRoutes(app, {
      auth: deps.auth,
      store: llmStore,
      adminEmails: deps.adminEmails ?? ['walissonead@gmail.com'],
      agentRuntimeOrigin: deps.agentRuntimeOrigin ?? 'https://pi-finance-agent.walissonead.workers.dev',
      agentRuntimeToken: deps.agentRuntimeAdminToken ?? 'dev-agent-runtime-admin-token-32-chars!',
      ...(deps.trustedOrigins ? { trustedOrigins: deps.trustedOrigins } : {}),
    });
  }
  if (deps.auth) {
    registerBetterAuthRoutes(app, deps.auth, undefined, undefined, deps.inviteSignupGuard);
    const adminEmails = deps.adminEmails ?? ['walissonead@gmail.com'];
    registerAdminInviteRoutes(app, {
      auth: deps.auth,
      adminEmails,
      delivery: deps.adminInviteDelivery,
    });
    if (deps.inviteService && deps.authorizeInviteCreate) {
      registerInviteRoutes(app, {
        auth: deps.auth,
        service: deps.inviteService,
        authorizeCreate: deps.authorizeInviteCreate,
        idempotency,
      });
    }
    if (deps.workspaceStore) {
      registerWorkspaceRoutes(app, {
        auth: deps.auth,
        store: deps.workspaceStore,
        idempotency,
        ...(deps.workspaceAccess ? { workspaceAccess: deps.workspaceAccess } : {}),
      });
    }

  }
};
