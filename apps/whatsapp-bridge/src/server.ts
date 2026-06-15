// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge — Fastify server
// Endpoints:
//   GET  /health                  liveness
//   POST /webhooks/evolution      Evolution GO message events
// ─────────────────────────────────────────────────────────────────────────────

import Fastify, { type FastifyInstance } from 'fastify';
import { join } from 'path';
import { loadEnv } from './env.js';
import {
  processWebhook,
  type PiClient,
  type ResponseSender,
  type SourceMessageStore,
  type UserRegistry,
  type WebhookPayload,
} from './webhook-handler.js';
import { EvolutionClient, FakeEvolutionClient } from './evolution-client.js';
import { createPiClient, getAgentRuntime } from './pi-client-factory.js';
import { createSourceMessageStore } from './source-message-store.js';

// ─────────────────────────────────────────────────────────────────────────────
// .env loader (no dotenv dep) — moved to ./env.ts
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Env helpers
// ─────────────────────────────────────────────────────────────────────────────

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAllowDirectMessages(): boolean {
  const raw = process.env.ALLOW_DIRECT_MESSAGES?.toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no') return false;
  return true;
}

function buildRegistry(): UserRegistry {
  const phones = new Set(csv(process.env.REGISTERED_PHONES ?? process.env.ADMIN_PHONES));
  const groups = new Set(csv(process.env.ALLOWED_GROUP_IDS ?? process.env.ALLOWED_GROUPS));
  // Default household is the first group or 'default' if no groups configured
  const defaultHousehold = process.env.DEFAULT_HOUSEHOLD_ID ?? 'default';
  return {
    isPhoneRegistered: (p) => phones.size === 0 ? true : phones.has(p),
    isGroupAllowed: (g) => groups.size === 0 ? true : groups.has(g),
    getHouseholdIdForGroup: (g) => (groups.has(g) ? defaultHousehold : null),
  };
}

function buildStore(): SourceMessageStore {
  const path = join(process.cwd(), 'data', 'dedupe-store.json');
  return createSourceMessageStore(path);
}

function buildSender(): ResponseSender {
  const baseUrl = process.env.EVOLUTION_GO_API_URL;
  const token = process.env.EVOLUTION_GO_INSTANCE_TOKEN;
  if (!baseUrl || !token) {
    console.warn('[bridge] Evolution not configured — using FakeEvolutionClient');
    return new FakeEvolutionClient();
  }
  return new EvolutionClient({ baseUrl, instanceToken: token });
}

// ─────────────────────────────────────────────────────────────────────────────
// App factory
// ─────────────────────────────────────────────────────────────────────────────

export interface AppOptions {
  expectedInstanceToken?: string;
  piClient?: PiClient;
  registry?: UserRegistry;
  store?: SourceMessageStore;
  sender?: ResponseSender;
  allowDirectMessages?: boolean;
}

export function createApp(options: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: false });

  const expectedToken =
    options.expectedInstanceToken ??
    process.env.EVOLUTION_GO_INSTANCE_TOKEN ??
    '';

  const registry = options.registry ?? buildRegistry();
  const store = options.store ?? buildStore();
  const sender = options.sender ?? buildSender();
  const piClient = options.piClient ?? createPiClient(
    process.env.DEFAULT_HOUSEHOLD_ID ?? 'default',
  );
  const allowDirectMessages = options.allowDirectMessages ?? parseAllowDirectMessages();

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/webhooks/evolution', async (req, reply) => {
    const payload = req.body as WebhookPayload | undefined;
    if (!payload || typeof payload !== 'object') {
      return reply.code(400).send({ status: 'failed', reason: 'payload inválido' });
    }
    try {
      const result = await processWebhook(
        payload,
        expectedToken,
        registry,
        store,
        piClient,
        sender,
        allowDirectMessages,
      );
      return reply.code(200).send(result);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'erro desconhecido';
      return reply.code(500).send({ status: 'failed', reason });
    }
  });

  return app;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  void loadEnv(process.cwd());
  console.log('[bridge] PI_AGENT_RUNTIME:', process.env.PI_AGENT_RUNTIME ?? 'unset');
  console.log('[bridge] cwd:', process.cwd());
  const host = process.env.HOST ?? '0.0.0.0';
  const port = parseInt(process.env.PORT ?? '3000', 10);

  // Create PiClient BEFORE createApp so the same instance is used by webhooks
  const piClient = createPiClient(process.env.DEFAULT_HOUSEHOLD_ID ?? 'default');
  const app = createApp({ piClient });

  try {
    await app.listen({ port, host });
    console.log(`[bridge] listening on http://${host}:${port}`);

    // Warm up the SAME piClient instance after HTTP is listening — does NOT block /health
    if (getAgentRuntime() === 'pi-native') {
      setImmediate(async () => {
        try {
          await (piClient as any).warmup?.();
          console.log('[bridge] Pi client warmed up');
        } catch (err) {
          console.error('[bridge] Pi warmup failed (non-critical):', err instanceof Error ? err.message : String(err));
        }
      });
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isMain =
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('server.ts') ||
  process.argv[1]?.endsWith('server.js');

if (isMain) {
  void main();
}
