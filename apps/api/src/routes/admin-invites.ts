import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { createBetterAuth } from '../auth/better-auth.js';
import { getBetterAuthSessionContext } from '../auth/better-auth.js';
import {
  type AdminInviteDelivery,
  generateRandomPassword,
  isUserAdmin,
} from '../auth/admin-invite-service.js';

type BetterAuth = ReturnType<typeof createBetterAuth>;

const inviteInputSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120).optional(),
});

export const registerAdminInviteRoutes = (
  app: FastifyInstance,
  opts: {
    auth: BetterAuth;
    adminEmails: string[];
    delivery: AdminInviteDelivery;
  },
): void => {
  app.post('/admin/invite', async (request, reply) => {
    const headers = new Headers();
    for (const [key, val] of Object.entries(request.headers)) {
      if (val !== undefined) headers.set(key, Array.isArray(val) ? val.join(', ') : String(val));
    }

    let session;
    try {
      session = await getBetterAuthSessionContext(opts.auth, headers);
    } catch {
      // Ignore
    }

    if (!session) {
      return reply.code(401).send({ code: 'auth.missing_session', message: 'authenticated session required' });
    }

    if (!isUserAdmin(session.email, opts.adminEmails)) {
      return reply.code(403).send({ code: 'admin.forbidden', message: 'Apenas administradores podem enviar convites.' });
    }

    const parsed = inviteInputSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const temporaryPassword = generateRandomPassword(16);
    const userName = parsed.data.name || normalizedEmail.split('@')[0]!;

    try {
      await opts.auth.api.createUser({
        body: {
          email: normalizedEmail,
          password: temporaryPassword,
          name: userName,
        },
      });
    } catch (err: unknown) {
      const errorMsg = (err as Error)?.message || 'Falha ao criar usuário convidado.';
      return reply.code(400).send({ code: 'admin.user_creation_failed', message: errorMsg });
    }

    await opts.delivery({
      email: normalizedEmail,
      password: temporaryPassword,
      invitedBy: session.email,
    });

    return reply.code(201).send({
      success: true,
      email: normalizedEmail,
      message: 'Convite enviado com sucesso.',
    });
  });
};
