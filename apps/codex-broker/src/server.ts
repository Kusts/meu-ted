import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { AuthCacheManager } from './auth-status.js';
import { CodexRuntimeAdapter, ChatCompletionRequestSchema, ALLOWLISTED_MODELS } from './runtime-adapter.js';
import {
  createInMemoryNonceReplayStore,
  verifyEnvelope,
  type HmacEnvelope,
  type NonceReplayStore,
} from './replay-store.js';

export type ServerOptions = {
  authCachePath: string;
  signingKey: string;
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
  replayStore?: NonceReplayStore;
  adapter?: CodexRuntimeAdapter;
};

export const buildCodexBrokerApp = (opts: ServerOptions): FastifyInstance => {
  const app = Fastify({ logger: false });
  const authManager = new AuthCacheManager(opts.authCachePath);
  const adapter = opts.adapter ?? new CodexRuntimeAdapter();
  const replayStore = opts.replayStore ?? createInMemoryNonceReplayStore();

  const verifyCloudflareAccess = (req: FastifyRequest): boolean => {
    if (!opts.cfAccessClientId || !opts.cfAccessClientSecret) {
      return true; // Not required in local development
    }

    const clientId = req.headers['cf-access-client-id'];
    const clientSecret = req.headers['cf-access-client-secret'];

    const providedId = Array.isArray(clientId) ? clientId[0] : clientId;
    const providedSecret = Array.isArray(clientSecret) ? clientSecret[0] : clientSecret;

    return providedId === opts.cfAccessClientId && providedSecret === opts.cfAccessClientSecret;
  };

  const verifyHmacRequest = (req: FastifyRequest, rawBodyString: string): { valid: boolean; reason?: string } => {
    const rawEnvelopeHeader = req.headers['x-codex-envelope'];
    const signatureHeader = req.headers['x-codex-signature'];

    const envelopeJson = Array.isArray(rawEnvelopeHeader) ? rawEnvelopeHeader[0] : rawEnvelopeHeader;
    const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

    if (!envelopeJson || !signature) {
      return { valid: false, reason: 'missing_hmac_headers' };
    }

    let envelope: HmacEnvelope;
    try {
      envelope = JSON.parse(envelopeJson) as HmacEnvelope;
    } catch {
      return { valid: false, reason: 'invalid_envelope_json' };
    }

    return verifyEnvelope(envelope, signature, opts.signingKey, rawBodyString, replayStore);
  };

  // Health check endpoint (public / monitoring)
  app.get('/health', async (_req, reply) => {
    const authStatus = authManager.getAuthStatus();
    return reply.code(200).send({
      status: 'ready',
      auth: {
        authenticated: authStatus.authenticated,
        reauthRequired: authStatus.reauthRequired,
        modeVerified: authStatus.modeVerified,
      },
      models: ALLOWLISTED_MODELS,
    });
  });

  // Models catalog
  app.get('/v1/models', async (req, reply) => {
    if (!verifyCloudflareAccess(req)) {
      return reply.code(403).send({ error: 'invalid_cloudflare_access_credentials' });
    }

    return reply.code(200).send({
      object: 'list',
      data: ALLOWLISTED_MODELS.map((id) => ({
        id,
        object: 'model',
        created: 1700000000,
        owned_by: 'openai',
      })),
    });
  });

  // Chat completions endpoint
  app.post('/v1/chat/completions', async (req, reply) => {
    if (!verifyCloudflareAccess(req)) {
      return reply.code(403).send({ error: 'invalid_cloudflare_access_credentials' });
    }

    const rawBody = JSON.stringify(req.body ?? {});
    const hmacCheck = verifyHmacRequest(req, rawBody);
    if (!hmacCheck.valid) {
      return reply.code(401).send({
        error: 'hmac_verification_failed',
        reason: hmacCheck.reason,
      });
    }

    const parsed = ChatCompletionRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request_schema',
        issues: parsed.error.issues,
      });
    }

    const authStatus = authManager.getAuthStatus();
    if (!authStatus.authenticated || authStatus.reauthRequired) {
      return reply.code(401).send({
        error: 'codex_reauth_required',
        message: 'Codex subscription authentication required or expired',
      });
    }

    try {
      const result = await adapter.executeCompletion(parsed.data, authStatus);
      return reply.code(200).send(result);
    } catch (e) {
      const message = (e as Error).message;
      return reply.code(500).send({
        error: 'codex_execution_failed',
        message,
      });
    }
  });

  // Cancel execution
  app.post('/v1/cancel', async (req, reply) => {
    if (!verifyCloudflareAccess(req)) {
      return reply.code(403).send({ error: 'invalid_cloudflare_access_credentials' });
    }

    const rawBody = JSON.stringify(req.body ?? {});
    const hmacCheck = verifyHmacRequest(req, rawBody);
    if (!hmacCheck.valid) {
      return reply.code(401).send({
        error: 'hmac_verification_failed',
        reason: hmacCheck.reason,
      });
    }

    const body = (req.body ?? {}) as { requestId?: string };
    if (!body.requestId) {
      return reply.code(400).send({ error: 'requestId_required' });
    }

    const cancelled = adapter.cancelExecution(body.requestId);
    return reply.code(200).send({ ok: true, cancelled });
  });

  return app;
};
