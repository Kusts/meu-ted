import type { FastifyInstance } from 'fastify';

export const registerCors = (app: FastifyInstance): void => {
  const origin = process.env.CORS_ORIGIN;
  if (!origin) return;

  app.addHook('onRequest', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Credentials', 'true');
  });

  app.options('*', async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Credentials', 'true');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Device-Token, Idempotency-Key, Accept');
    return reply.code(204).send();
  });
};
