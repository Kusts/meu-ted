// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge — Fastify server
// Endpoints:
//   GET  /health                  liveness
//   POST /webhooks/evolution      Evolution GO message events
// ─────────────────────────────────────────────────────────────────────────────

import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  processWebhook,
  type PiClient,
  type ResponseSender,
  type SourceMessageStore,
  type UserRegistry,
  type WebhookPayload,
} from './webhook-handler.js';
import { EvolutionClient, FakeEvolutionClient } from './evolution-client.js';
import { createPiClient } from './pi-client-factory.js';

// ─────────────────────────────────────────────────────────────────────────────
// .env loader (no dotenv dep)
// ─────────────────────────────────────────────────────────────────────────────

function loadEnvFile(startDir: string): void {
  let dir = startDir;
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      const content = readFileSync(candidate, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (key && process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Env helpers
// ─────────────────────────────────────────────────────────────────────────────

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
  const seen = new Set<string>();
  return {
    isProcessed: (id) => seen.has(id),
    markProcessed: (msg) => seen.add(msg.providerMessageId),
    saveError: () => {
      // intentionally swallow — webhook handler keeps local error state
    },
  };
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
  loadEnvFile(process.cwd());
  const host = process.env.HOST ?? '0.0.0.0';
  const port = parseInt(process.env.PORT ?? '3000', 10);

  const app = createApp();
  try {
    await app.listen({ port, host });
    console.log(`[bridge] listening on http://${host}:${port}`);
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
