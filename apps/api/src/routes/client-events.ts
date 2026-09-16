import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { AuthResolver } from './auth.js';
import type { AuthenticatedContext } from '../auth/request-context.js';
import {
  buildObservabilityEvent,
  ObservabilityPrivacyError,
} from '../audit/events.js';

/**
 * Minimal authenticated client-event transport (FIX-F0, SPEC §24).
 *
 * Accepts ONLY the two PWA-originated event types (offline.locked, mic.error);
 * every other catalog event is server-emitted by its own block. The body is
 * validated by the strict T0.4 contract (buildObservabilityEvent) and, on
 * success, written to the Fastify structured logger — the SPEC §24 consumer
 * for these two metrics. NO database persistence: there is deliberately no
 * audit_logs write here (the table still requires operation_record_id until
 * V054 lands, and these counters are log-consumed by design).
 */
const CLIENT_EVENT_TYPES = ['offline.locked', 'mic.error'] as const;

const bodySchema = z.object({
  eventType: z.enum(CLIENT_EVENT_TYPES),
  payload: z.record(z.string(), z.unknown()),
});

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
    actorType: 'device',
    deviceId: context.deviceId,
  };
};

const handleError = (error: unknown, reply: FastifyReply) => {
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number') {
    return reply.code(statusCode).send({
      code: (error as { code?: string }).code ?? 'auth.error',
      message: (error as Error).message,
    });
  }
  throw error;
};

export const registerClientEventsRoutes = (
  app: FastifyInstance,
  opts: { resolveToken: AuthResolver },
): void => {
  app.post('/client-events', async (request, reply) => {
    let context: AuthenticatedContext;
    try {
      context = await resolveAuth(request, opts.resolveToken);
    } catch (error) {
      return handleError(error, reply);
    }
    const parsed = bodySchema.safeParse((request.body as unknown) ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ code: 'validation.error', issues: parsed.error.issues });
    }
    let event: ReturnType<typeof buildObservabilityEvent>;
    try {
      event = buildObservabilityEvent(parsed.data.eventType, parsed.data.payload);
    } catch (error) {
      if (error instanceof ObservabilityPrivacyError) {
        return reply
          .code(400)
          .send({ code: 'observability.privacy_violation', message: error.message });
      }
      throw error;
    }
    request.log.info({
      event: 'client.event',
      eventType: event.eventType,
      workspaceId: context.householdId,
      actorId: context.actorId,
      ...event.payload,
    });
    return reply.code(204).send();
  });
};
