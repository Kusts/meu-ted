import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { createBetterAuth } from './better-auth.js';
import { getBetterAuthSessionContext } from './better-auth.js';
import { InviteError, type InviteService } from './invites.js';
import { createInMemoryIdempotencyStore, requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import { DomainError } from '../writes/errors.js';
import './request-context.js';

type BetterAuth = ReturnType<typeof createBetterAuth>;

const createInviteInput = z.object({
  householdId: z.string().uuid(),
  email: z.string().trim().email(),
  role: z.enum(['owner', 'member']),
  expiresAt: z.coerce.date(),
});
const acceptInviteInput = z.object({ token: z.string().length(64) });
const workspaceParams = z.object({ householdId: z.string().uuid() });
const inviteRevokeParams = z.object({
  householdId: z.string().uuid(),
  inviteId: z.string().trim().min(1).max(200),
});

export const registerInviteRoutes = (app: FastifyInstance, opts: {
  auth: BetterAuth;
  service: InviteService;
  authorizeCreate: (input: { userId: string; householdId: string }) => Promise<boolean>;
  idempotency?: IdempotencyStore;
}): void => {
  const idempotency = opts.idempotency ?? createInMemoryIdempotencyStore();

  const sessionPreHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const context = await getBetterAuthSessionContext(opts.auth, new Headers(request.headers as Record<string, string>));
      if (!context) return reply.code(401).send({ code: 'auth.missing_session', message: 'authenticated session required' });
      request.betterAuthContext = context;
    } catch {
      return reply.code(401).send({ code: 'auth.invalid_session', message: 'authenticated session required' });
    }
  };

  app.post('/auth/invites', { preHandler: sessionPreHandler }, async (request, reply) => {
    const parsed = createInviteInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const context = request.betterAuthContext!;
    if (!(await opts.authorizeCreate({ userId: context.userId, householdId: parsed.data.householdId }))) {
      return reply.code(403).send({ code: 'auth.invite_forbidden', message: 'invite creation is not authorized' });
    }

    let key: string;
    try {
      key = requireIdempotencyKey(request.headers);
    } catch (error) {
      return sendInviteError(reply, error);
    }

    try {
      const result = await idempotency.lookupOrRecord(
        {
          workspaceId: parsed.data.householdId,
          actorType: 'user',
          actorId: context.userId,
          operation: 'invite.create',
          key,
        },
        parsed.data,
        async () => {
          const invite = await opts.service.createInvite({ ...parsed.data, invitedByUserId: context.userId });
          return {
            status: 201,
            body: { inviteId: invite.id, email: invite.email, expiresAt: invite.expiresAt.toISOString() },
          };
        },
      );
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (error) {
      return sendInviteError(reply, error);
    }
  });

  // Keep the bearer-like invite token in the POST body, not the URL, so request logs cannot capture it.
  app.post('/auth/invites/accept', { preHandler: sessionPreHandler }, async (request, reply) => {
    const parsed = acceptInviteInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const context = request.betterAuthContext!;
    try {
      const result = await opts.service.acceptInvite({ token: parsed.data.token, userId: context.userId, userEmail: context.email });
      return reply.code(200).send(result);
    } catch (error) {
      return sendInviteError(reply, error);
    }
  });

  app.get('/workspaces/:householdId/invites', { preHandler: sessionPreHandler }, async (request, reply) => {
    const parsed = workspaceParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const context = request.betterAuthContext!;
    if (!(await opts.authorizeCreate({ userId: context.userId, householdId: parsed.data.householdId }))) {
      return reply.code(403).send({ code: 'auth.invite_forbidden', message: 'invite management is not authorized' });
    }
    try {
      const items = await opts.service.listPendingInvites({ householdId: parsed.data.householdId });
      return reply.code(200).send({ items, total: items.length });
    } catch (error) {
      return sendInviteError(reply, error);
    }
  });

  const handleRevoke = async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = inviteRevokeParams.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const context = request.betterAuthContext!;
    if (!(await opts.authorizeCreate({ userId: context.userId, householdId: parsed.data.householdId }))) {
      return reply.code(403).send({ code: 'auth.invite_forbidden', message: 'invite revocation is not authorized' });
    }

    let key: string;
    try {
      key = requireIdempotencyKey(request.headers);
    } catch (error) {
      return sendInviteError(reply, error);
    }

    try {
      const result = await idempotency.lookupOrRecord(
        {
          workspaceId: parsed.data.householdId,
          actorType: 'user',
          actorId: context.userId,
          operation: 'invite.revoke',
          key,
        },
        { householdId: parsed.data.householdId, inviteId: parsed.data.inviteId },
        async () => {
          const res = await opts.service.revokeInvite({
            householdId: parsed.data.householdId,
            inviteId: parsed.data.inviteId,
          });
          return { status: 200, body: { success: true, inviteId: res.id, revokedAt: res.revokedAt.toISOString() } };
        },
      );
      if (result.replayed) reply.header('Idempotent-Replayed', 'true');
      return reply.code(result.response.status).send(result.response.body);
    } catch (error) {
      return sendInviteError(reply, error);
    }
  };

  app.delete('/workspaces/:householdId/invites/:inviteId', { preHandler: sessionPreHandler }, handleRevoke);
  app.post('/workspaces/:householdId/invites/:inviteId/revoke', { preHandler: sessionPreHandler }, handleRevoke);
};

const sendInviteError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof InviteError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  if (error instanceof DomainError) return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  throw error;
};
