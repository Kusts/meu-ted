import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { safeCompareTokens as safeCompare } from '../auth/safe-compare.js';
import { isKindExecutable } from '../agent/llm-config.js';

const relayBody = z.object({
  provider: z
    .literal('opencode-zen')
    .or(z.literal('opencode-go'))
    .or(z.literal('openai-api'))
    .or(z.literal('openrouter')),
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
  // OpenRouter standard models fallback
  'openai/gpt-4o-mini',
  'deepseek/deepseek-chat',
  'google/gemini-2.0-flash-001',
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
 *
 * Fase 3-FIX R7-rev: DB entries are keyed as `providerId:modelId` pairs so
 * the request provider is honored — the same model name under another
 * provider does not inherit allowlisting. Env/default entries are bare
 * names (no provider to pair with) and keep matching by name.
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
            models
              .filter((m) => m.enabled && usableProviders.has(m.providerId))
              .map((m) => `${m.providerId}:${m.modelId}`),
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
    /** H-02: real OpenAI parity — relay executes openai-api upstream instead of only allowlisting it. */
    openaiApiKey?: string;
    /** OpenRouter parity — relay executes openrouter upstream. */
    openrouterApiKey?: string;
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

    const parsed = relayBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ code: 'validation.error', issues: parsed.error.issues });
    }
    const { provider, model, prompt, system } = parsed.data;

    // H-02: each relayable provider needs its own key — a missing key fails
    // closed before any upstream call.
    const isOpenAi = provider === 'openai-api';
    const isOpenRouter = provider === 'openrouter';
    const isOpenAiCompatible = isOpenAi || isOpenRouter;
    const providerApiKey = isOpenAi
      ? deps.openaiApiKey
      : isOpenRouter
        ? (deps.openrouterApiKey ?? process.env.OPENROUTER_API_KEY)
        : deps.zenApiKey;
    if (!providerApiKey) {
      const missingEnv = isOpenAi
        ? 'OPENAI_API_KEY'
        : isOpenRouter
          ? 'OPENROUTER_API_KEY'
          : 'OPENCODE_ZEN_API_KEY';
      return reply.code(503).send({
        code: 'agent.provider_not_configured',
        message: `${missingEnv} não configurada na API.`,
      });
    }

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
    // Fase 3-FIX R7-rev: the request provider scopes the allowlist — a DB
    // pair matches only as `providerId:modelId`, while env/default bare
    // names keep matching by name. A provider absent from the allowlist
    // (or disabled upstream of it) is 403, never borrowed from a sibling.
    if (!allowedModels.has(`${provider}:${model}`) && !allowedModels.has(model)) {
      return reply.code(403).send({ code: 'agent.model_not_allowlisted', message: 'Modelo não permitido no relay.' });
    }

    const baseUrl = provider === 'opencode-zen'
      ? 'https://opencode.ai/zen/v1'
      : provider === 'opencode-go'
        ? 'https://opencode.ai/zen/go/v1'
        : provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1'
          : 'https://api.openai.com/v1';
    // H-02: allowlisted upstream origins only (H-06) — never a caller-supplied URL.
    const upstreamUrl = isOpenAiCompatible ? `${baseUrl}/chat/completions` : `${baseUrl}/responses`;
    const upstreamHeaders: Record<string, string> = {
      authorization: `Bearer ${providerApiKey}`,
      'content-type': 'application/json',
      ...(isOpenRouter ? { 'HTTP-Referer': 'https://synkroo.com.br', 'X-Title': 'Pi Financeiro' } : {}),
    };
    const upstreamBody = isOpenAiCompatible
      ? {
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: prompt },
        ],
      }
      : {
        model,
        input: prompt,
        ...(system ? { instructions: system } : {}),
      };
    const requestTimeoutMs = deps.requestTimeoutMs ?? 60_000;
    const timeoutError = () => Object.assign(new Error('Timeout aguardando provider.'), { name: 'AbortError' });

    // Fase 3-FIX R4-rev: ONE absolute deadline shared by headers and body.
    // The budget never restarts: after headers resolve, the body races only
    // the REMAINING time. Expiry aborts the upstream request and rejects as
    // AbortError; a single timer is cleared in `finally` either way.
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const deadline = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const res = await fetch(upstreamUrl, {
          method: 'POST',
          headers: upstreamHeaders,
          body: JSON.stringify(upstreamBody),
          signal: controller.signal,
        });

        // FIX R1: o abort acima só vale se o fetch cooperar. Um upstream
        // (ou mock) que ignore o AbortSignal pode resolver headers após o
        // budget — verifique o deadline explicitamente antes de aceitar
        // qualquer byte como resposta válida.
        if (Date.now() - startedAt >= requestTimeoutMs) throw timeoutError();

        let bodyTimer: ReturnType<typeof setTimeout> | undefined;
        let body: {
          error?: { type?: string; message?: string };
          output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
          choices?: Array<{ message?: { content?: string } }>;
          cost?: string | number;
        } | null;
        try {
          const remainingMs = Math.max(0, requestTimeoutMs - (Date.now() - startedAt));
          body = (await Promise.race([
            res.json().catch(() => null),
            new Promise<null>((_, reject) => {
              bodyTimer = setTimeout(() => {
                controller.abort();
                reject(timeoutError());
              }, remainingMs);
            }),
          ])) as {
            error?: { type?: string; message?: string };
            output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
            choices?: Array<{ message?: { content?: string } }>;
            cost?: string | number;
          } | null;
        } finally {
          if (bodyTimer) clearTimeout(bodyTimer);
        }

      // FIX R1 (cont.): mesmo após o race, um body imediato pode ter
      // vencido um timer de saldo ~0 resolvendo após o prazo — revalide o
      // deadline antes de aceitar/retornar o body.
      if (Date.now() - startedAt >= requestTimeoutMs) throw timeoutError();

      if (!res.ok) {
        const message = body?.error?.message ?? `HTTP ${res.status}`;
        const code = res.status === 429 ? 'agent.rate_limited' : res.status === 401 ? 'agent.provider_auth' : 'agent.provider_error';
        return reply.code(res.status === 429 ? 429 : 502).send({ code, message });
      }

      const text = isOpenAiCompatible
        ? (body?.choices?.[0]?.message?.content ?? '')
        : (body?.output
          ?.filter((o) => o.type === 'message')
          .flatMap((o) => o.content ?? [])
          .filter((c) => c.type === 'output_text')
          .map((c) => c.text ?? '')
          .join('') ?? '');

      if (!text) {
        return reply.code(502).send({ code: 'agent.inference_error', message: 'No output generated by provider.' });
      }

        return reply.send({ text, model, cost: body?.cost ?? 0, provider });
      } finally {
        clearTimeout(deadline);
      }
    } catch (err) {
      const isAbort = (err as { name?: string })?.name === 'AbortError';
      return reply.code(504).send({ code: 'agent.provider_timeout', message: isAbort ? 'Timeout aguardando provider.' : (err as Error).message });
    }
  });
};