import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createDelegatedTurnToken } from "../auth/delegated-token.js";
import { PhoneResolutionError, type PhoneWorkspaceStore } from "../auth/phone-workspace.js";

const bridgeContextBodySchema = z.object({
  phone: z.string().trim().min(1).max(32),
  chatId: z.string().trim().min(1).max(128),
  providerMessageId: z.string().trim().min(1).max(128),
  requestId: z.string().trim().min(1).max(128),
  workspaceId: z.string().uuid().optional(),
}).strict();

export interface BridgeContextRouteOptions {
  phoneWorkspace: PhoneWorkspaceStore;
  delegationSecret: string;
  now?: () => number;
}

/**
 * Minimal read-only scope minted by this route (P2 wildcard remediation:
 * never mint `["*"]` here again).
 */
export const BRIDGE_CONTEXT_CAPABILITIES: string[] = ["financial.read"];

/**
 * @deprecated Legacy compatibility route for the removed WhatsApp bridge
 * (P3 f640e84). New clients must use the workspace-scoped auth flow instead.
 * Kept public only so legacy callers fail closed with a scoped token.
 */
export const registerBridgeContextRoutes = (
  app: FastifyInstance,
  options: BridgeContextRouteOptions,
): void => {
  app.post("/auth/bridge-context", async (request, reply) => {
    const parsed = bridgeContextBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "validation.error",
        message: "Invalid bridge context payload",
        issues: parsed.error.issues,
      });
    }

    try {
      const resolution = await options.phoneWorkspace.resolvePhone(
        parsed.data.phone,
        parsed.data.workspaceId,
      );

      const delegatedToken = await createDelegatedTurnToken(
        {
          actorId: resolution.userId,
          workspaceId: resolution.workspaceId,
          role: resolution.role,
          capabilities: [...BRIDGE_CONTEXT_CAPABILITIES],
          requestId: parsed.data.requestId,
        },
        options.delegationSecret,
        options.now ? options.now() : Date.now(),
      );

      return reply.code(200).send({
        success: true,
        delegatedToken,
        user: {
          id: resolution.userId,
          name: resolution.userName,
          email: resolution.email,
        },
        workspace: {
          id: resolution.workspaceId,
          role: resolution.role,
        },
      });
    } catch (err: unknown) {
      if (err instanceof PhoneResolutionError) {
        return reply.code(err.statusCode).send({
          code: err.code,
          message: err.message,
        });
      }
      const message = err instanceof Error ? err.message : "Internal error resolving bridge context";
      return reply.code(500).send({
        code: "auth.internal_error",
        message,
      });
    }
  });
};
