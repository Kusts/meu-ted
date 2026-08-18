import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DEVICE_TOKEN_HEADER } from "../auth/device-token.js";
import type { AuthResolver } from "./auth.js";
import type { AuthenticatedContext } from "../auth/request-context.js";
import type { ShadowDivergenceStore } from "../observability/shadow-divergence.js";

export const shadowDivergenceEventSchema = z.object({
  capability: z.string().trim().min(1).max(128),
  outcome: z.enum(["match", "divergence", "legacy_error", "api_error", "skipped"]),
  requestHash: z.string().regex(/^[a-f0-9]{64}$/),
  apiHash: z.string().regex(/^[a-f0-9]{64}$/).optional().nullable(),
  legacyHash: z.string().regex(/^[a-f0-9]{64}$/).optional().nullable(),
  durationMs: z.coerce.number().int().min(0).max(60000).default(0),
  error: z.string().max(500).optional().nullable(),
}).strict();

const summaryQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

const eventsQuerySchema = z.object({
  capability: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const handleError = (error: unknown, reply: FastifyReply) => {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number") {
    return reply.code(statusCode).send({
      code: (error as { code?: string }).code ?? "auth.error",
      message: (error as Error).message,
    });
  }
  throw error;
};

const resolveAuth = async (
  request: FastifyRequest,
  resolveToken: AuthResolver,
): Promise<AuthenticatedContext> => {
  if (request.authenticatedContext) return request.authenticatedContext;
  const header = request.headers[DEVICE_TOKEN_HEADER];
  const token = Array.isArray(header) ? header[0] : header;
  const context = await resolveToken(token);
  return {
    householdId: context.householdId,
    actorId: context.deviceId,
    actorType: "device",
    deviceId: context.deviceId,
  };
};

export const registerShadowObservabilityRoutes = (
  app: FastifyInstance,
  options: {
    shadowDivergence: ShadowDivergenceStore;
    resolveToken: AuthResolver;
  },
): void => {
  app.post("/observability/shadow-divergence", async (request, reply) => {
    let auth: AuthenticatedContext;
    try {
      auth = await resolveAuth(request, options.resolveToken);
    } catch (error) {
      return handleError(error, reply);
    }

    const parsed = shadowDivergenceEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "validation.error",
        message: "Invalid shadow divergence payload",
        issues: parsed.error.issues,
      });
    }

    const event = await options.shadowDivergence.recordEvent({
      workspaceId: auth.householdId,
      capability: parsed.data.capability,
      outcome: parsed.data.outcome,
      requestHash: parsed.data.requestHash,
      apiHash: parsed.data.apiHash ?? null,
      legacyHash: parsed.data.legacyHash ?? null,
      durationMs: parsed.data.durationMs,
      error: parsed.data.error ?? null,
    });

    return reply.code(201).send({
      success: true,
      event,
    });
  });

  app.get("/observability/shadow-divergence/summary", async (request, reply) => {
    let auth: AuthenticatedContext;
    try {
      auth = await resolveAuth(request, options.resolveToken);
    } catch (error) {
      return handleError(error, reply);
    }

    const parsed = summaryQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "validation.error",
        message: "Invalid summary query parameters",
        issues: parsed.error.issues,
      });
    }

    const summaryOpts: { from?: string; to?: string } = {};
    if (parsed.data.from) summaryOpts.from = parsed.data.from;
    if (parsed.data.to) summaryOpts.to = parsed.data.to;
    const summaries = await options.shadowDivergence.getSummary(auth.householdId, summaryOpts);

    return reply.code(200).send({
      success: true,
      summaries,
    });
  });

  app.get("/observability/shadow-divergence/events", async (request, reply) => {
    let auth: AuthenticatedContext;
    try {
      auth = await resolveAuth(request, options.resolveToken);
    } catch (error) {
      return handleError(error, reply);
    }

    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({
        code: "validation.error",
        message: "Invalid events query parameters",
        issues: parsed.error.issues,
      });
    }

    const listOpts: { capability?: string; limit?: number } = {};
    if (parsed.data.capability) listOpts.capability = parsed.data.capability;
    if (parsed.data.limit !== undefined) listOpts.limit = parsed.data.limit;
    const events = await options.shadowDivergence.listEvents(auth.householdId, listOpts);


    return reply.code(200).send({
      success: true,
      events,
    });
  });
};
