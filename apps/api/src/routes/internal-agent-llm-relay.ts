import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { safeCompareTokens as safeCompare } from '../auth/safe-compare.js';
import { isKindExecutable } from '../agent/llm-config.js';

const relayBody = z.object({
  provider: z.literal('opencode-zen').or(z.literal('opencode-go')),
  model: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(16000),
  system: z.string().trim().max(8000).optional(),
});

const DEFAULT_ALLOWED_MODELS = new Set([
  // OpenCode Zen free models (no payment method required)
  'muse-spark-1.2-contributor-free',
  'deepseek-v4-flash-free',
  'mimo-v2.5-free',
  'hy3-free',
  'nemotron-3-ultra-free',
  'nemotron-3.5-lightning-free',
  'laguna-s-2.1-free',
]);

const RELAY_MODEL_CACHE_TTL_MS = 60_000;

const parseEnvAllowlist = (raw: string | undefined): string[] | null => {
  if (!raw) return null;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : null;
};

export interface RelayModelSource {
  listModels(): Promise<Array<{ providerId: string; modelId: string; enabled: boolean }>>;
  listProviders(): Promise<Array<{ id: string; enabled: boolean; kind: string }>>;
}

/**
 * Fase 2 item 8 + Fase 3 D3: resolves the relay model allowlist by priority —
 * RELAY_ALLOWED_MODELS env (csv, explicit admin override) wins, then the
 * enabled agent_llm_models (60s cache), then the built-in default set.
 * Env entries are authoritative as written; DB entries pass only when the
 * model is enabled AND its provider exists, is enabled and has an
 * executable kind — a disabled model or provider is never relayable.
 * A failing store does NOT fall back silently (see route handler: 503).
 */
export const createRelayModelResolver = (deps: {
  store?: RelayModelSource;
  cacheTtlMs?: number;
  now?: () => number;
} = {}) => {
  const ttl = deps.cacheTtlMs ?? RELAY_MODEL_CACHE_TTL_MS;
  const now = deps.now ?? Date.now;
  let cache: { at: number; models: Set<string> } | null = null;
  return async (): Promise<Set<string>> => {
    const envList = parseEnvAllowlist(process.env.RELAY_ALLOWED_MODELS);
    if (envList) return new Set(envList);
    if (deps.store) {
      if (!cache || now() - cache.at >= ttl) {
        const [models, providers] = await Promise.all([
          deps.store.listModels(),
          deps.store.listProviders(),
        ]);
        const usableProviders = new Set(
          providers.filter((p) => p.enabled && isKindExecutable(p.kind)).map((p) => p.id),
        );
        cache = {
          at: now(),
          models: new Set(
            models.filter((m) => m.enabled && usableProviders.has(m.providerId)).map((m) => m.modelId),
          ),
        };
      }
      return cache.models;
    }
    return DEFAULT_ALLOWED_MODELS;
  };
};

export const registerAgentLlmRelayRoutes = (
  app: FastifyInstance,
  deps: {
    adminToken: string;
    zenApiKey?: string;
    llmConfigStore?: RelayModelSource;
    cacheTtlMs?: number;
    now?: () => number;
    /** Full upstream budget (headers + body) in ms. Default 60s. */
    requestTimeoutMs?: number;
  },
): void => {
  const resolveAllowedModels = createRelayModelResolver({
    ...(deps.llmConfigStore ? { store: deps.llmConfigStore } : {}),
    ...(deps.cacheTtlMs !== undefined ? { cacheTtlMs: deps.cacheTtlMs } : {}),
    ...(deps.now ? { now: deps.now } : {}),
  });
  app.post('/internal/agent/llm-relay', async (req, reply) => {
    const rawToken = req.headers['x-agent-runtime-admin-token'];
    const token = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!token || !deps.adminToken || !safeCompare(token, deps.adminToken)) {
      return reply.code(401).send({ code: 'auth.invalid_token', message: 'Token administrativo inválido.' });
    }
    if (!deps.zenApiKey) {
      return reply.code(503).send({ code: 'agent.provider_not_configured', message: 'OPENCODE_ZEN_API_KEY não configurada na API.' });
    }

    const parsed = relayBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    }
    const { provider, model, prompt, system } = parsed.data;

    // Fase 3 D3: a configured store that fails resolves fail-closed with an
    // explicit operational code — never a silent fallback to the built-in set.
    let allowedModels: Set<string>;
    try {
      allowedModels = await resolveAllowedModels();
    } catch {
      return reply.code(503).send({
        code: 'agent.relay_allowlist_unavailable',
        message: 'Allowlist do relay indisponível (store de configuração inacessível).',
      });
    }
    if (!allowedModels.has(model)) {
      return reply.code(403).send({ code: 'agent.model_not_allowlisted', message: 'Modelo não permitido no relay.' });
    }

    const baseUrl = provider === 'opencode-zen' ? 'https://opencode.ai/zen/v1' : 'https://opencode.ai/zen/go/v1';
    const requestTimeoutMs = deps.requestTimeoutMs ?? 60_000;
    const timeoutError = () => Object.assign(new Error('Timeout aguardando provider.'), { name: 'AbortError' });

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const res = await fetch(`${baseUrl}/responses`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${deps.zenApiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: prompt,
            ...(system ? { instructions: system } : {}),
          }),
          signal: controller.signal,
        });

        // The same budget covers a slow body: race the JSON parse against
        // a deadline that aborts and rejects as AbortError. The race timer
        // is cleared below whether the body or the deadline wins.
        let bodyTimer: ReturnType<typeof setTimeout> | undefined;
        let body: {
          error?: { type?: string; message?: string };
          output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
          cost?: string | number;
        } | null;
        try {
          body = (await Promise.race([
            res.json().catch(() => null),
            new Promise<null>((_, reject) => {
              bodyTimer = setTimeout(() => {
                controller.abort();
                reject(timeoutError());
              }, requestTimeoutMs);
            }),
          ])) as {
            error?: { type?: string; message?: string };
            output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
            cost?: string | number;
          } | null;
        } finally {
          if (bodyTimer) clearTimeout(bodyTimer);
        }

      if (!res.ok) {
        const message = body?.error?.message ?? `HTTP ${res.status}`;
        const code = res.status === 429 ? 'agent.rate_limited' : res.status === 401 ? 'agent.provider_auth' : 'agent.provider_error';
        return reply.code(res.status === 429 ? 429 : 502).send({ code, message });
      }

      const text = body?.output
        ?.filter((o) => o.type === 'message')
        .flatMap((o) => o.content ?? [])
        .filter((c) => c.type === 'output_text')
        .map((c) => c.text ?? '')
        .join('') ?? '';

      if (!text) {
        return reply.code(502).send({ code: 'agent.inference_error', message: 'No output generated by provider.' });
      }

        return reply.send({ text, model, cost: body?.cost ?? 0, provider });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      return reply.code(504).send({ code: 'agent.provider_timeout', message: isAbort ? 'Timeout aguardando provider.' : (err as Error).message });
    }
  });
};