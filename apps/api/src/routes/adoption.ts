import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { DEVICE_TOKEN_HEADER } from "../auth/device-token.js";
import type { AuthResolver } from "./auth.js";
import type { AuthenticatedContext } from "../auth/request-context.js";
import {
  ADOPTION_EVENT_TYPES,
  type AdoptionStore,
} from "../observability/adoption.js";

const eventSchema = z.object({
  eventType: z.enum(ADOPTION_EVENT_TYPES),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  flowId: z.string().trim().min(1).max(128).optional(),
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const funnelQuerySchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
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

const parseWindow = (fromValue?: string, toValue?: string) => {
  const now = new Date();
  const from = fromValue
    ? new Date(`${fromValue}T00:00:00.000Z`)
    : new Date(now.getTime() - 30 * 86_400_000);
  const to = toValue ? new Date(`${toValue}T23:59:59.999Z`) : now;
  if (
    !Number.isFinite(from.getTime()) ||
    !Number.isFinite(to.getTime()) ||
    from > to
  ) {
    return undefined;
  }
  if (to.getTime() - from.getTime() > 366 * 86_400_000) return undefined;
  return { from, to };
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

export const registerAdoptionRoutes = (
  app: FastifyInstance,
  opts: { store: AdoptionStore; resolveToken: AuthResolver },
): void => {
  app.post("/observability/adoption-events", async (request, reply) => {
    let context: AuthenticatedContext;
    try {
      context = await resolveAuth(request, opts.resolveToken);
    } catch (error) {
      return handleError(error, reply);
    }
    const parsed = eventSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    }
    try {
      await opts.store.record({
        workspaceId: context.householdId,
        actorId: context.actorId,
        eventType: parsed.data.eventType,
        occurredAt: parsed.data.occurredAt
          ? new Date(parsed.data.occurredAt)
          : new Date(),
        ...(parsed.data.flowId ? { flowId: parsed.data.flowId } : {}),
      });
      return reply.code(201).send({ accepted: true });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  app.get("/observability/adoption-funnel", async (request, reply) => {
    let context: AuthenticatedContext;
    try {
      context = await resolveAuth(request, opts.resolveToken);
    } catch (error) {
      return handleError(error, reply);
    }
    const parsed = funnelQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ code: "validation.error", issues: parsed.error.issues });
    }
    const window = parseWindow(parsed.data.from, parsed.data.to);
    if (!window)
      return reply.code(400).send({ code: "validation.invalid_date_window" });
    try {
      return reply.code(200).send(
        await opts.store.funnel({
          workspaceId: context.householdId,
          ...window,
        }),
      );
    } catch (error) {
      return handleError(error, reply);
    }
  });
};
