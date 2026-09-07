import { AIChatAgent, type UIMessage } from "agents/ai-chat-agent";
import { streamText, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { protocolSchema } from "@pi-finance/llm-contracts/schemas";
import { fetchRuntimeConfig, type RuntimeSnapshot } from "./llm/runtime-config-client.js";
import { createLanguageModel } from "./llm/model-factory.js";
import type { Protocol } from "./llm/provider-registry.js";
import { executeWithFallback, failoverReasonOf, logFailoverEvent } from "./llm/failover.js";
import { executeBrokerCompletion } from "./llm/private-broker-client.js";
import {
  assembleCognition,
  buildExposedTools,
  INSTRUCTIONS_VERSION as TED_INSTRUCTIONS_VERSION,
  TED_SYSTEM_PROMPT_LEGACY,
} from "./agent-config/index.js";
import {
  checkUsageLimit,
  estimateTokens,
  initializeUsageSchema,
  recordUsage,
} from "./safety/usage-policy.js";
import { redactTranscript } from "./transcript-safety.js";
import {
  migrateLegacyHistory,
  transformLegacyMessages,
  computeHistoryHash,
  type LegacyFullExport,
  type MigrationResult,
  type SdkUIMessage,
} from "./migration/legacy-history.js";
import { generatedHttpTools } from "./generated/http-tools.js";
import { setGlobalApiContext } from "./tools/api-client.js";
import { createDelegatedTurnToken } from "./delegated-token.js";

export type Env = {
  AGENT_DELEGATION_SECRET?: string;
  AGENT_CONNECTION_TOKEN_SECRET?: string;
  AGENT_CONFIG_TOKEN?: string;
  AGENT_RUNTIME_ADMIN_TOKEN?: string;
  OPENCODE_ZEN_API_KEY?: string;
  OPENCODE_GO_API_KEY?: string;
  OPENAI_API_KEY?: string;
  API_ORIGIN?: string;
  CODEX_BROKER_ORIGIN?: string;
  CODEX_BROKER_ACCESS_CLIENT_ID?: string;
  CODEX_BROKER_ACCESS_CLIENT_SECRET?: string;
  CODEX_BROKER_REQUEST_SIGNING_KEY?: string;
  TAVILY_API_KEY?: string;
  BRAVE_API_KEY?: string;
};

export type IntentionSnapshotRow = {
  intention_id: string;
  version: number;
  provider_id: string;
  model_id: string;
  protocol: string;
  rollout_percentage: number;
  security_epoch: number;
  fallback_provider_id?: string | null;
  fallback_model_id?: string | null;
  /**
   * Bare upstream model name (no `provider_id:` prefix) for direct execution.
   * `model_id` is the store row id (configuration reference); the upstream
   * provider API expects the bare name from the validated slot. Legacy rows
   * predate this column and read back as null (derived at use time).
   */
  model_name?: string | null;
  fallback_model_name?: string | null;
  created_at: string;
};

export const INTENTION_SNAPSHOT_FALLBACK_COLUMNS = ['fallback_provider_id', 'fallback_model_id'] as const;

/** Fase 3 item 5: bare upstream names persisted alongside the row ids. */
export const INTENTION_SNAPSHOT_MODEL_COLUMNS = ['model_name', 'fallback_model_name'] as const;

/**
 * Fase 3-FIX R2: resolves the executable upstream name or null. A stored
 * name wins; otherwise only the conventional `provider_id:` prefix is
 * derivable. Anything else is an opaque row id — returning it as the bare
 * model would send a configuration key to the provider, so callers must
 * fail closed (refetch, never execute with the row id).
 */
export const resolveBareModelName = (
  providerId: string,
  modelId: string,
  storedName?: string | null,
): string | null => {
  if (typeof storedName === "string" && storedName.length > 0) return storedName;
  const prefix = `${providerId}:`;
  if (modelId.startsWith(prefix) && modelId.length > prefix.length) {
    return modelId.slice(prefix.length);
  }
  return null;
};

/**
 * Fase 3-FIX R2: local persisted rows are validated with the same
 * contract/invariants as the remote snapshot before execution. Corrupted
 * rows are discarded (miss → remote refetch), never executed.
 */
export const intentionSnapshotRowSchema = z.object({
  intention_id: z.string().min(1),
  version: z.number(),
  provider_id: z.string().min(1),
  model_id: z.string().min(1),
  protocol: protocolSchema,
  rollout_percentage: z.number(),
  security_epoch: z.number(),
  fallback_provider_id: z.string().nullable().optional(),
  fallback_model_id: z.string().nullable().optional(),
  model_name: z.string().min(1).nullable().optional(),
  fallback_model_name: z.string().min(1).nullable().optional(),
  created_at: z.string(),
});

/**
 * Backfills the fallback columns on pre-existing Durable Object tables.
 * CREATE TABLE IF NOT EXISTS never upgrades legacy tables, so missing
 * columns are added explicitly (PRAGMA first, so concurrent initializers
 * and mock storage without PRAGMA support stay safe).
 */
export const ensureIntentionSnapshotColumns = (sql: {
  exec<T>(query: string, ...bindings: unknown[]): Iterable<T>;
}): void => {
  let existing: Set<string> | null = null;
  try {
    const rows = [...sql.exec<{ name: string }>(`PRAGMA table_info(intention_snapshots)`)];
    existing = new Set(rows.map((row) => row.name));
  } catch {
    // PRAGMA unsupported here (e.g. mock storage): skip structural ADDs,
    // but still attempt the idempotent value backfill below.
  }
  if (existing) {
    for (const column of [...INTENTION_SNAPSHOT_FALLBACK_COLUMNS, ...INTENTION_SNAPSHOT_MODEL_COLUMNS]) {
      if (!existing.has(column)) {
        try {
          sql.exec(`ALTER TABLE intention_snapshots ADD COLUMN ${column} TEXT`);
        } catch {
          // A concurrent initializer won the race; the column now exists.
        }
      }
    }
  }
  // Fase 3-FIX R2: structural backfill — fill names derivable from
  // conventional `provider_id:model_id` row ids. Opaque ids are left NULL
  // on purpose (fail-closed at use, never guessed). Idempotent and scoped
  // to NULL cells only, so concurrent writers cannot clobber real names.
  for (const [nameColumn, idColumn, providerColumn] of [
    ['model_name', 'model_id', 'provider_id'],
    ['fallback_model_name', 'fallback_model_id', 'fallback_provider_id'],
  ] as const) {
    try {
      sql.exec(
        `UPDATE intention_snapshots SET ${nameColumn} = SUBSTR(${idColumn}, LENGTH(${providerColumn}) + 2) WHERE ${nameColumn} IS NULL AND ${idColumn} LIKE ${providerColumn} || ':%'`,
      );
    } catch {
      // Best effort: ancient tables without the id column, or a concurrent
      // migration, must never break initialization.
    }
  }
};

/**
 * Refactor item 6: Codex (plano Coding) executes through the private broker
 * (browser-session auth), never through a direct endpoint. The snapshot only
 * carries the provider id, so routing is by id convention — any provider id
 * containing `codex` resolves to the broker leg.
 */
export const isCodexProviderId = (providerId: string): boolean =>
  providerId.toLowerCase().includes('codex');

export type CodexBrokerEnv = {
  CODEX_BROKER_ORIGIN?: string;
  CODEX_BROKER_ACCESS_CLIENT_ID?: string;
  CODEX_BROKER_ACCESS_CLIENT_SECRET?: string;
  CODEX_BROKER_REQUEST_SIGNING_KEY?: string;
};

export const runCodexBrokerText = async (
  env: CodexBrokerEnv,
  input: {
    model: string;
    prompt: string;
    system: string;
    requestId: string;
    intentionId: string;
    workspaceId: string;
    actorId: string;
  },
): Promise<string> => {
  const brokerOrigin = env.CODEX_BROKER_ORIGIN ?? '';
  const signingKey = env.CODEX_BROKER_REQUEST_SIGNING_KEY ?? '';
  if (!brokerOrigin || !signingKey) {
    throw Object.assign(new Error('Codex broker not configured'), { code: 'agent.provider_not_configured', status: 503 });
  }
  const result = await executeBrokerCompletion(
    {
      brokerOrigin,
      ...(env.CODEX_BROKER_ACCESS_CLIENT_ID ? { cfAccessClientId: env.CODEX_BROKER_ACCESS_CLIENT_ID } : {}),
      ...(env.CODEX_BROKER_ACCESS_CLIENT_SECRET ? { cfAccessClientSecret: env.CODEX_BROKER_ACCESS_CLIENT_SECRET } : {}),
      signingKey,
    },
    {
      model: input.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      requestId: input.requestId,
      intentionId: input.intentionId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
    },
  );
  const text = result.choices[0]?.message?.content ?? '';
  if (!text) throw Object.assign(new Error('No output generated by provider.'), { code: 'agent.inference_error', status: 502 });
  return text;
};

export const TED_SYSTEM_PROMPT = TED_SYSTEM_PROMPT_LEGACY;
export { TED_INSTRUCTIONS_VERSION };

/**
 * Regra de ouro da camada cognitiva (ver agent-config/instructions.ts):
 * sempre utilize a ferramenta adequada em vez de responder "sem autorização"
 * ou "não tenho acesso" — a partir de dados reais do workspace via tools.
 */

export class FinanceChatAgent extends AIChatAgent<Env> {
  static override readonly messageConcurrency = "queue" as const;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    if (state?.storage?.sql) {
      try {
        initializeUsageSchema(state.storage.sql);
        state.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS intention_snapshots (
            intention_id TEXT PRIMARY KEY,
            version INTEGER NOT NULL,
            provider_id TEXT NOT NULL,
            model_id TEXT NOT NULL,
            protocol TEXT NOT NULL,
            rollout_percentage INTEGER NOT NULL DEFAULT 100,
            security_epoch INTEGER NOT NULL DEFAULT 1,
            fallback_provider_id TEXT,
            fallback_model_id TEXT,
            model_name TEXT,
            fallback_model_name TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);
        ensureIntentionSnapshotColumns(state.storage.sql);
      } catch {
        // Ignored if table already exists or mock storage
      }
    }
  }

  private async resolveIntentionSnapshot(intentionId: string): Promise<IntentionSnapshotRow | null> {
    if (this.state?.storage?.sql) {
      try {
        const rows = [...this.state.storage.sql.exec<IntentionSnapshotRow>(
          `SELECT * FROM intention_snapshots WHERE intention_id = ?`,
          intentionId,
        )];
        if (rows.length > 0 && rows[0]) {
          // Legacy rows predate the fallback/model-name columns: normalize to nulls.
          const candidate = {
            fallback_provider_id: null,
            fallback_model_id: null,
            model_name: null,
            fallback_model_name: null,
            ...rows[0],
          };
          // Fase 3-FIX R2: the persisted row is validated with the same
          // contract/invariants as the remote snapshot. Corrupted rows and
          // opaque row ids without a persisted name are discarded (miss →
          // remote refetch below), never executed.
          const parsed = intentionSnapshotRowSchema.safeParse(candidate);
          if (parsed.success) {
            const valid = parsed.data;
            if (
              resolveBareModelName(valid.provider_id, valid.model_id, valid.model_name) !== null
            ) {
              return valid;
            }
          }
        }
      } catch {
        // Continue if sql exec fails
      }
    }

    const apiOrigin = this.env?.API_ORIGIN ?? "https://api.synkroo.com.br";
    const configToken = this.env?.AGENT_CONFIG_TOKEN ?? "";
    if (!configToken) {
      return null;
    }

    let config: RuntimeSnapshot;
    try {
      config = await fetchRuntimeConfig(apiOrigin, configToken);
    } catch {
      return null;
    }

    if (!config.activeProviderId || !config.activeModelId) {
      return null;
    }

    const snapshot: IntentionSnapshotRow = {
      intention_id: intentionId,
      version: config.version,
      provider_id: config.activeProviderId,
      model_id: config.activeModelId,
      protocol: config.activeProtocol ?? "chat-completions",
      rollout_percentage: config.activeRolloutPercentage,
      security_epoch: config.securityEpoch,
      fallback_provider_id: config.fallbackProviderId ?? null,
      fallback_model_id: config.fallbackModelId ?? null,
      // Fase 3 item 5 + Fase 3-FIX R2: bare upstream name from the validated
      // slot; legacy derivation only when the slot is absent (conventional
      // prefix only — opaque ids stay null and fail closed at use).
      model_name:
        config.activeModelName ??
        resolveBareModelName(config.activeProviderId, config.activeModelId, null),
      fallback_model_name: config.fallbackModelName ?? null,
      created_at: new Date().toISOString(),
    };

    if (this.state?.storage?.sql) {
      try {
        this.state.storage.sql.exec(
          `INSERT INTO intention_snapshots (intention_id, version, provider_id, model_id, protocol, rollout_percentage, security_epoch, fallback_provider_id, fallback_model_id, model_name, fallback_model_name, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          snapshot.intention_id,
          snapshot.version,
          snapshot.provider_id,
          snapshot.model_id,
          snapshot.protocol,
          snapshot.rollout_percentage,
          snapshot.security_epoch,
          snapshot.fallback_provider_id ?? null,
          snapshot.fallback_model_id ?? null,
          snapshot.model_name ?? null,
          snapshot.fallback_model_name ?? null,
          snapshot.created_at,
        );
      } catch {
        // Ignore duplicate insert race
      }
    }

    return snapshot;
  }

  override async onChatMessage(messagePayload: unknown, ..._rest: unknown[]): Promise<unknown> {
    const payload = (messagePayload ?? {}) as { text?: string; intentionId?: string; actorId?: string };
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    const intentionId = payload.intentionId ?? `intent-${Date.now()}`;
    const actorId = payload.actorId ?? "anonymous";

    if (!text) {
      return { text: "Mensagem vazia." };
    }

    const estimatedTokens = estimateTokens(text);
    if (this.state?.storage?.sql) {
      const budgetCheck = checkUsageLimit(this.state.storage.sql, actorId, estimatedTokens);
      if (!budgetCheck.allowed) {
        return { text: `Limite de uso atingido: ${budgetCheck.reason}` };
      }
    }

    const snapshot = await this.resolveIntentionSnapshot(intentionId);
    if (!snapshot) {
      return { text: "TED ready: provider not configured" };
    }

    try {
      // Fase 3-FIX R2: execute with the bare upstream name, never the store
      // row id. An unresolvable name is fail-closed here as well (defense in
      // depth — resolveIntentionSnapshot already refetches such rows).
      const bareModelId = resolveBareModelName(
        snapshot.provider_id,
        snapshot.model_id,
        snapshot.model_name,
      );
      if (!bareModelId) {
        return { text: "TED ready: provider not configured" };
      }
      // Refactor item 5: direct path retries the configured fallback in the
      // same request on retryable failures (timeout, 429/5xx, auth).
      const fallbackBareModelId =
        snapshot.fallback_provider_id && snapshot.fallback_model_id
          ? (resolveBareModelName(
              snapshot.fallback_provider_id,
              snapshot.fallback_model_id,
              snapshot.fallback_model_name,
            ) ?? snapshot.fallback_model_id)
          : null;
      const runDirect = async (providerId: string, modelId: string) => {
        // Cognitive layer (Part A, item 15): versioned persona + skills +
        // playbook assembled per turn, with the model's tools actually wired.
        const cognition = assembleCognition(text, { webEnv: (this.env ?? {}) as Record<string, string | undefined> });
        if (isCodexProviderId(providerId)) {
          const brokerText = await runCodexBrokerText((this.env ?? {}) as CodexBrokerEnv, {
            model: modelId,
            prompt: text,
            system: cognition.system,
            requestId: `direct-${intentionId}`,
            intentionId,
            workspaceId: 'direct',
            actorId,
          });
          return { text: brokerText };
        }
        const modelInstance = createLanguageModel(
          providerId,
          modelId,
          snapshot.protocol as Protocol,
          (this.env ?? {}) as Record<string, string | undefined>,
        );
        const exposedTools = buildExposedTools(cognition.toolNames, {
          apiOrigin: this.env?.API_ORIGIN,
          workspaceId: 'direct',
          actorId,
          intentionId,
          lastUserMessage: text,
          webEnv: (this.env ?? {}) as Record<string, string | undefined>,
        });
        return streamText({
          model: modelInstance.model,
          system: cognition.system,
          prompt: text,
          tools: exposedTools,
          stopWhen: stepCountIs(5),
        });
      };
      const outcome = await executeWithFallback(
        () => runDirect(snapshot.provider_id, bareModelId),
        snapshot.fallback_provider_id && fallbackBareModelId
          ? () => runDirect(snapshot.fallback_provider_id as string, fallbackBareModelId as string)
          : null,
      );
      logFailoverEvent(
        {
          intentionId,
          primaryProviderId: snapshot.provider_id,
          primaryModelId: bareModelId,
          fallbackProviderId: snapshot.fallback_provider_id,
          fallbackModelId: fallbackBareModelId,
        },
        outcome,
      );

      const result = outcome.result;

      if (this.state?.storage?.sql) {
        recordUsage(this.state.storage.sql, actorId, intentionId, estimatedTokens, estimatedTokens);
      }

      return result;
    } catch (err) {
      const message = (err as Error)?.message ?? "Erro desconhecido ao processar inferência.";
      return { text: `TED error: ${redactTranscript(message)}` };
    }
  }

  override async onMessage(connection: unknown, message: string): Promise<void> {
    if (typeof message === "string" && (message.includes("clearHistory") || message.includes("setMessages"))) {
      const conn = connection as { send?: (s: string) => void };
      conn.send?.(JSON.stringify({ error: "agent.clear_forbidden" }));
      return;
    }
    await super.onMessage(connection, message);
  }

  private chatQueue?: Promise<unknown>;

  private async enqueueChat<T>(task: () => Promise<T>): Promise<T> {
    const prev = this.chatQueue ?? Promise.resolve();
    const next = prev.then(() => task(), () => task());
    this.chatQueue = next;
    return next;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/rpc/chat" && request.method === "POST") {
      const actorId = request.headers.get("x-agent-actor");
      const workspaceId = request.headers.get("x-agent-workspace");
      if (!actorId || !workspaceId || !actorId.trim() || !workspaceId.trim()) {
        return Response.json({ code: "agent.unauthorized", message: "Missing authenticated actor or workspace" }, { status: 401 });
      }

      let body: { text?: unknown; content?: unknown; intentionId?: unknown; attachments?: unknown };
      try {
        body = (await request.json()) as { text?: unknown; content?: unknown; intentionId?: unknown; attachments?: unknown };
      } catch {
        return Response.json({ code: "agent.invalid_message" }, { status: 400 });
      }
      const rawText = typeof body.text === "string" ? body.text : (typeof body.content === "string" ? body.content : "");
      const unredactedText = rawText.trim();
      const incomingAttachments = Array.isArray(body.attachments) ? (body.attachments as Array<{ type: string; url: string; name: string }>) : [];
      if (!unredactedText && incomingAttachments.length === 0) return Response.json({ code: "agent.invalid_message" }, { status: 400 });
      const text = unredactedText ? redactTranscript(unredactedText) : incomingAttachments.length > 0 ? `[anexo ${incomingAttachments.map((a) => a.name).join(", ")}]` : "";
      const intentionId = typeof body.intentionId === "string" && body.intentionId.trim()
        ? body.intentionId.trim()
        : `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      return this.enqueueChat(async () => {
        const snapshot = await this.resolveIntentionSnapshot(intentionId);
        if (!snapshot) {
          return Response.json({ code: "agent.provider_not_configured", message: "Nenhum provedor de IA ativo configurado." }, { status: 503 });
        }

        if (this.state?.storage?.sql) {
          const budgetCheck = checkUsageLimit(this.state.storage.sql, actorId, estimateTokens(text));
          if (!budgetCheck.allowed) {
            return Response.json({ code: "agent.usage_limit", message: budgetCheck.reason }, { status: 429 });
          }
        }

        // Persist User message (redacted) BEFORE relay inference
        const userCreatedAt = new Date().toISOString();
        const userMsg: UIMessage = {
          id: `msg-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          role: "user",
          parts: [{ type: "text", text }],
          metadata: {
            actorId,
            workspaceId,
            createdAt: userCreatedAt,
            ...(incomingAttachments.length > 0 ? { attachments: incomingAttachments } : {}),
          },
        } as unknown as UIMessage;

        if (typeof this.persistMessages !== "function") {
          return Response.json(
            { code: "agent.persistence_unavailable", message: "SDK persistence is not available" },
            { status: 503 },
          );
        }
        await this.persistMessages([userMsg]);

        try {
          const relayOrigin = this.env?.API_ORIGIN ?? "https://api.synkroo.com.br";
          const adminToken = this.env?.AGENT_RUNTIME_ADMIN_TOKEN ?? "";

          // --- Integração de ferramentas TED: preparar contexto delegado e enriquecer prompt com dados financeiros ---
          let enrichedPrompt = text;
          try {
            const delegationSecret = this.env?.AGENT_DELEGATION_SECRET;
            if (delegationSecret) {
              const roleHeader = (this as unknown as { env: Env }).env ? "member" : "member";
              // Criar token delegado workspace-isolado para chamadas de ferramentas
              const delegatedToken = await createDelegatedTurnToken(
                {
                  actorId,
                  workspaceId,
                  role: "member",
                  capabilities: ["financial.read", "financial.write"],
                  requestId: intentionId,
                },
                delegationSecret,
              );
              setGlobalApiContext({ delegatedToken, apiOrigin: relayOrigin });

              // Heurística leve para chamar ferramentas relevantes antes do LLM, garantindo que TED não negue acesso
              const lower = text.toLowerCase();
              const toolCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
              if (/(saldo|balance|conta|accounts)/i.test(lower)) toolCalls.push({ name: "get_balance", params: { householdId: workspaceId } });
              if (/(transa[çc][aã]o|extrato|gastos|despesa|transactions)/i.test(lower)) toolCalls.push({ name: "list_recent_transactions", params: { householdId: workspaceId, limit: 10 } });
              if (/(meta|goal)/i.test(lower)) toolCalls.push({ name: "list_goals", params: { householdId: workspaceId } });
              if (/(or[çc]amento|budget)/i.test(lower)) toolCalls.push({ name: "list_budgets", params: { householdId: workspaceId } });
              if (/(cart[aã]o|fatura|statement|cartao)/i.test(lower)) toolCalls.push({ name: "list_statements", params: { householdId: workspaceId } });
              if (toolCalls.length === 0) {
                // Fallback: sempre oferecer contexto mínimo para evitar "sem autorização"
                toolCalls.push({ name: "get_balance", params: { householdId: workspaceId } });
                toolCalls.push({ name: "list_recent_transactions", params: { householdId: workspaceId, limit: 5 } });
              }
              // Executar até 2 ferramentas para não estourar tempo, com fail-open
              for (const call of toolCalls.slice(0, 2)) {
                const tool = generatedHttpTools.find((t) => t.name === call.name);
                if (!tool) continue;
                try {
                  const result = await (tool.execute as unknown as (p: Record<string, unknown>) => Promise<unknown>)(call.params);
                  const snippet = JSON.stringify(result).slice(0, 800);
                  // Enriquecer prompt com resultado da ferramenta (isolado por workspace)
                  enrichedPrompt += `\n\n[Dados da ferramenta ${call.name} (workspace ${workspaceId}): ${snippet}]`;
                } catch {
                  // fail-open: não bloquear chat se ferramenta falhar
                }
              }
            }
          } catch {
            // fail-open para enriquecimento
          }

          let relayRaw: string;
          let relayBody: { text?: string; code?: string; message?: string };
          let relayRes: Response;
          let effectiveProvider = snapshot.provider_id;
          let effectiveModel = snapshot.model_id;
          let usedFallback = false;
          let failoverReason: string | null = null;

          // Cognitive layer for the relay leg too: persona + skills +
          // playbook travel as the system prompt (the relay has no tool
          // loop, so the enriched prompt keeps carrying workspace data).
          const cognition = assembleCognition(text, { webEnv: (this.env ?? {}) as Record<string, string | undefined> });

          // Refactor item 6: Codex (plano Coding) executa via broker privado
          // (sessão de browser), nunca via relay HTTP (o relay só permite
          // zen/go). O resultado é sintetizado no mesmo formato relay para
          // reaproveitar fallback, persistência e contrato de erro abaixo.
          if (isCodexProviderId(snapshot.provider_id)) {
            const codexModel =
              resolveBareModelName(snapshot.provider_id, snapshot.model_id, snapshot.model_name) ??
              snapshot.model_id;
            try {
              const brokerText = await runCodexBrokerText((this.env ?? {}) as CodexBrokerEnv, {
                model: codexModel,
                prompt: enrichedPrompt,
                system: cognition.system,
                requestId: intentionId,
                intentionId,
                workspaceId,
                actorId,
              });
              relayBody = { text: brokerText };
              relayRaw = JSON.stringify(relayBody);
              relayRes = new Response(relayRaw, { status: 200 });
            } catch (brokerErr) {
              failoverReason = failoverReasonOf(brokerErr);
              relayBody = {
                code: (brokerErr as { code?: string })?.code ?? 'agent.inference_error',
                message: (brokerErr as Error)?.message ?? 'Falha ao processar a inferência.',
              };
              relayRaw = JSON.stringify(relayBody);
              relayRes = new Response(relayRaw, {
                status:
                  typeof (brokerErr as { status?: number })?.status === 'number'
                    ? (brokerErr as { status: number }).status
                    : 502,
              });
            }
          } else {
            const primaryRes = await fetch(`${relayOrigin.replace(/\/$/, "")}/internal/agent/llm-relay`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-agent-runtime-admin-token": adminToken,
              },
              body: JSON.stringify({
                provider: snapshot.provider_id,
                model: snapshot.model_id,
                prompt: enrichedPrompt,
                system: cognition.system,
              }),
            });
            relayRaw = await primaryRes.text().catch(() => "");
            try { relayBody = JSON.parse(relayRaw || "{}") as { text?: string; code?: string; message?: string }; } catch { relayBody = {}; }
            relayRes = primaryRes;
            if (!relayRes.ok || typeof relayBody.text !== "string" || !relayBody.text) {
              failoverReason = relayBody.code ?? `http_${relayRes.status}`;
            }
          }

          // Se a inferência primária falhar e houver fallback configurado, tenta o fallback
          if ((!relayRes.ok || typeof relayBody!.text !== "string" || !relayBody!.text) && snapshot.fallback_provider_id && snapshot.fallback_model_id) {
            // Fallback Codex também sai pelo broker; demais provedores pelo relay.
            if (isCodexProviderId(snapshot.fallback_provider_id)) {
              try {
                const fbModel =
                  resolveBareModelName(
                    snapshot.fallback_provider_id,
                    snapshot.fallback_model_id,
                    snapshot.fallback_model_name,
                  ) ?? snapshot.fallback_model_id;
                const fbText = await runCodexBrokerText((this.env ?? {}) as CodexBrokerEnv, {
                  model: fbModel,
                  prompt: enrichedPrompt,
                  system: cognition.system,
                  requestId: `${intentionId}:fallback`,
                  intentionId,
                  workspaceId,
                  actorId,
                });
                relayBody = { text: fbText };
                relayRaw = JSON.stringify(relayBody);
                relayRes = new Response(relayRaw, { status: 200 });
                effectiveProvider = snapshot.fallback_provider_id;
                effectiveModel = snapshot.fallback_model_id;
                usedFallback = true;
              } catch {
                // Silenciosamente segue para retorno de erro primário caso fallback também falhe
              }
            } else {
            try {
              const fallbackRes = await fetch(`${relayOrigin.replace(/\/$/, "")}/internal/agent/llm-relay`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-agent-runtime-admin-token": adminToken,
                },
                body: JSON.stringify({
                  provider: snapshot.fallback_provider_id,
                  model: snapshot.fallback_model_id,
                  prompt: enrichedPrompt,
                  system: cognition.system,
                }),
              });
              if (fallbackRes.ok) {
                const fbRaw = await fallbackRes.text().catch(() => "");
                const fbBody = JSON.parse(fbRaw || "{}") as { text?: string };
                if (typeof fbBody.text === "string" && fbBody.text) {
                  relayBody = fbBody;
                  relayRes = fallbackRes;
                  effectiveProvider = snapshot.fallback_provider_id;
                  effectiveModel = snapshot.fallback_model_id;
                  usedFallback = true;
                }
              }
            } catch {
              // Silenciosamente segue para retorno de erro primário caso fallback também falhe
            }
            }
          }

          // Refactor item 5: métrica/log estruturado do failover (sem segredos).
          logFailoverEvent(
            {
              intentionId,
              primaryProviderId: snapshot.provider_id,
              primaryModelId: snapshot.model_id,
              fallbackProviderId: snapshot.fallback_provider_id,
              fallbackModelId: snapshot.fallback_model_id,
            },
            { usedFallback, failoverReason: usedFallback ? null : failoverReason },
          );

          if (!relayRes.ok || typeof relayBody.text !== "string" || !relayBody.text) {
            const safeRelayRaw = redactTranscript(String(relayRaw)).slice(0, 200);
            const safeErrorMessage = redactTranscript(relayBody.message ?? "Falha ao processar a inferência.");
            return Response.json(
              {
                code: relayBody.code ?? "agent.inference_error",
                message: safeErrorMessage,
                provider: snapshot.provider_id,
                model: snapshot.model_id,
                relayStatus: relayRes.status,
                relayRaw: safeRelayRaw,
              },
              { status: relayRes.status >= 400 && relayRes.status < 600 ? relayRes.status : 502 },
            );
          }
          const output = redactTranscript(relayBody.text);

          if (this.state?.storage?.sql) {
            recordUsage(this.state.storage.sql, actorId, intentionId, estimateTokens(text), estimateTokens(output));
          }

          // Persist Assistant TED message (redacted) AFTER relay response
          const assistantCreatedAt = new Date().toISOString();
          const assistantMsg: UIMessage = {
            id: `msg-asst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "assistant",
            parts: [{ type: "text", text: output }],
            metadata: {
              actorId: "ted",
              workspaceId,
              provider: effectiveProvider,
              model: effectiveModel,
              fallback: usedFallback,
              createdAt: assistantCreatedAt,
            },
          };

          if (typeof this.persistMessages !== "function") {
            return Response.json(
              { code: "agent.persistence_unavailable", message: "SDK persistence is not available" },
              { status: 503 },
            );
          }
          await this.persistMessages([assistantMsg]);

          return Response.json({
            turnId: intentionId,
            intentionId,
            status: "completed",
            output,
            workspaceId,
            provider: snapshot.provider_id,
            model: snapshot.model_id,
          });
        } catch (err) {
          const message = (err as Error)?.message ?? "Erro desconhecido ao processar inferência.";
          return Response.json({ code: "agent.inference_error", message: redactTranscript(message) }, { status: 502 });
        }
      });
    }

    if (url.pathname === "/rpc/history" && request.method === "GET") {
      const actorId = request.headers.get("x-agent-actor");
      const workspaceId = request.headers.get("x-agent-workspace");
      if (!actorId || !workspaceId || !actorId.trim() || !workspaceId.trim()) {
        return Response.json({ code: "agent.unauthorized", message: "Missing authenticated actor or workspace" }, { status: 401 });
      }

      const allMessages = Array.isArray(this.messages) ? this.messages : [];
      // Isolamento por workspace: filtrar mensagens cujo workspaceId difere (defesa em profundidade, DO já é por workspace)
      const rawMessages = allMessages.filter((msg) => {
        const ws = (msg.metadata as { workspaceId?: string } | undefined)?.workspaceId;
        return !ws || ws === workspaceId;
      });

      const items = rawMessages.map((msg) => {
        const msgActorId = (msg.metadata as { actorId?: string } | undefined)?.actorId ?? (msg.role === "assistant" ? "ted" : "unknown");
        let contentText = "";
        if (Array.isArray(msg.parts)) {
          contentText = msg.parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
        }
        const isOwn = msg.role === "user" && msgActorId === actorId;
        const createdAt = (msg.metadata as { createdAt?: string } | undefined)?.createdAt ?? undefined;
        const attachments = (msg.metadata as { attachments?: Array<{ type: string; url: string; name: string }> } | undefined)?.attachments;
        return {
          id: String(msg.id ?? `msg-${Date.now()}`),
          actorId: msgActorId,
          role: String(msg.role ?? "user"),
          content: contentText,
          text: contentText,
          createdAt: typeof createdAt === "string" ? createdAt : undefined,
          isOwn,
          ...(attachments ? { attachments } : {}),
        };
      });

      items.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });

      return Response.json({ items, total: items.length });
    }

    return new Response("Not found", { status: 404 });
  }

  async importLegacyHistory(exportData: LegacyFullExport): Promise<MigrationResult> {
    return this.enqueueChat(async () => {
      if (typeof this.persistMessages !== "function") {
        return {
          success: false,
          importedCount: 0,
          skipped: false,
          reason: "missing_persist_callback: SDK persistMessages is required for durable history migration",
        };
      }

      const persistCallback = async (msgs: SdkUIMessage[]): Promise<void> => {
        await this.persistMessages(msgs);
      };

      if (this.state?.storage?.sql) {
        return migrateLegacyHistory(exportData, this.state.storage.sql, persistCallback);
      }

      if (exportData.hasInFlightTurns) {
        return {
          success: false,
          importedCount: 0,
          skipped: false,
          reason: "migration_blocked_turns_in_flight: workspace has active turns in queued/running state",
        };
      }

      const transformed = transformLegacyMessages(exportData.messages, exportData.workspaceId);
      await persistCallback(transformed);

      return {
        success: true,
        importedCount: transformed.length,
        skipped: false,
        migrationHash: computeHistoryHash(exportData.messages),
      };
    });
  }
}
