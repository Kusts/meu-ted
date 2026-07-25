import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEVICE_TOKEN_HEADER } from '../auth/device-token.js';
import type { ProfileStore } from '../profile/store.js';
import type { AuthResolver } from './auth.js';

const patchInput = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(120).or(z.literal('')).optional(),
  phone: z.string().trim().max(40).optional(),
  avatarColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  greetingStyle: z.enum(['auto', 'minimal', 'verbose']).optional(),
});

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export const registerProfileRoutes = (
  app: FastifyInstance,
  opts: { resolveToken: AuthResolver; profileStore: ProfileStore },
): void => {
  app.get('/profile', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    let ctx;
    try {
      ctx = await opts.resolveToken(Array.isArray(token) ? token[0] : token);
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }
    const existing = await opts.profileStore.get(ctx.householdId);
    return reply.code(200).send({ profile: existing });
  });

  app.patch('/profile', async (req, reply) => {
    const token = req.headers[DEVICE_TOKEN_HEADER];
    let ctx;
    try {
      ctx = await opts.resolveToken(Array.isArray(token) ? token[0] : token);
    } catch (e) {
      const err = e as { statusCode?: number; code?: string; message?: string };
      return reply.code(err.statusCode ?? 401).send({ code: err.code ?? 'auth.error', message: err.message ?? 'unauthorized' });
    }

    const parsed = patchInput.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    }

    const data = parsed.data;
    // Defensive: zod's regex is already enforced, but keep a runtime check
    // for defense-in-depth since we'll likely evolve the schema.
    if (data.avatarColor && !HEX_COLOR.test(data.avatarColor)) {
      return reply.code(400).send({ code: 'validation.error', message: 'avatarColor must be #RRGGBB hex' });
    }

    const profile = await opts.profileStore.upsert(ctx.householdId, {
      name: data.name,
      email: data.email,
      phone: data.phone,
      avatarColor: data.avatarColor,
      greetingStyle: data.greetingStyle,
    });
    return reply.code(200).send({ profile });
  });
};
