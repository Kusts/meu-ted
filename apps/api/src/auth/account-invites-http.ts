import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { createBetterAuth } from './better-auth.js';
import { getBetterAuthSessionContext } from './better-auth.js';
import { InviteError, type AccountInviteService } from './account-invites.js';
import { createInMemoryIdempotencyStore, requireIdempotencyKey, type IdempotencyStore } from '../writes/idempotency.js';
import { DomainError } from '../writes/errors.js';
import { isUserAdmin } from './admin-invite-service.js';
import './request-context.js';

type BetterAuth = ReturnType<typeof createBetterAuth>;
// Account invites have no persistent workspace id; the Postgres idempotency
// store still requires a valid UUID for operation_records.workspace_id.
// Derive a deterministic synthetic UUID from the authenticated admin.
const ACCOUNT_INVITE_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c9';
export const getSyntheticWorkspaceId = (authUserId: string): string => {
  const hash = createHash('sha256').update(`${ACCOUNT_INVITE_NAMESPACE}:account-invite.create:${authUserId}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

const createAccountInviteInput = z.object({
  email: z.string().trim().email(),
  expiresAt: z.coerce.date().optional(),
});
const verifyInput = z.object({ token: z.string().length(64) });

export const registerAccountInviteRoutes = (
  app: FastifyInstance,
  opts: {
    auth: BetterAuth;
    service: AccountInviteService;
    adminEmails: string[];
    idempotency?: IdempotencyStore;
  },
): void => {
  const idempotency = opts.idempotency ?? createInMemoryIdempotencyStore();

  const adminPreHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const context = await getBetterAuthSessionContext(opts.auth, new Headers(request.headers as Record<string, string>));
      if (!context) return reply.code(401).send({ code: 'auth.missing_session', message: 'authenticated session required' });
      if (!isUserAdmin(context.email, opts.adminEmails)) {
        return reply.code(403).send({ code: 'admin.forbidden', message: 'Apenas administradores podem enviar convites.' });
      }
      request.betterAuthContext = context;
    } catch {
      return reply.code(401).send({ code: 'auth.invalid_session', message: 'authenticated session required' });
    }
  };

  // Admin creates account invite (token-based, email via SMTP)
  app.post('/admin/invites/account', { preHandler: adminPreHandler }, async (request, reply) => {
    const parsed = createAccountInviteInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    const context = request.betterAuthContext!;

    let key: string;
    try {
      key = requireIdempotencyKey(request.headers);
    } catch (error) {
      return sendInviteError(reply, error);
    }

    const expiresAt = parsed.data.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    try {
      const result = await idempotency.lookupOrRecord(
        {
workspaceId: getSyntheticWorkspaceId(context.userId),
          actorType: 'user',
          actorId: context.userId,
          operation: 'account-invite.create',
          key,
        },
        { email: parsed.data.email, expiresAt: expiresAt.toISOString() },
        async () => {
          const invite = await opts.service.createAccountInvite({
            email: parsed.data.email,
            invitedByUserId: context.userId,
            expiresAt,
          });
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

  // Public verify for account invite token
  app.post('/auth/account-invites/verify', async (request, reply) => {
    const parsed = verifyInput.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    try {
      const result = await opts.service.verifyAccountInvite({ token: parsed.data.token });
      return reply.code(200).send({
        email: result.email,
        expiresAt: result.expiresAt.toISOString(),
      });
    } catch (error) {
      return sendInviteError(reply, error);
    }
  });
};

const sendInviteError = (reply: FastifyReply, error: unknown) => {
  if (error instanceof InviteError) {
    const e = error as InviteError;
    return reply.code(e.statusCode).send({ code: e.code, message: e.message });
  }
  if (error instanceof DomainError) {
    const e = error as DomainError;
    return reply.code(e.statusCode).send({ code: e.code, message: e.message });
  }
  throw error;
};
