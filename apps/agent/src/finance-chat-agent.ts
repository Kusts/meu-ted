import { AIChatAgent, type UIMessage } from "agents/ai-chat-agent";
import { streamText, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { protocolSchema } from "@pi-finance/llm-contracts/schemas";
import { fetchRuntimeConfig, type RuntimeSnapshot } from "./llm/runtime-config-client.js";
import { createLanguageModel } from "./llm/model-factory.js";
import type { Protocol } from "./llm/provider-registry.js";
import { logFailoverEvent } from "./llm/failover.js";
import { executeBrokerCompletion } from "./llm/private-broker-client.js";
import {
  assembleCognition,
  buildExposedTools,
  INSTRUCTIONS_VERSION as TED_INSTRUCTIONS_VERSION,
  TED_SYSTEM_PROMPT_LEGACY,
  initializeMemorySchema,
  initializeSessionSchema,
  isMemoryEnabled,
  recallMemories,
  renderMemoryBlock,
  compactContext,
  extractiveSummary,
  toContextTurns,
  learnFromTurn,
  buildMemoryTools,
  bumpTurnCount,
  rememberFact,
  setMemoryEnabled,
  currentSession,
  endSession,
  type MemorySql,
} from "./agent-config/index.js";
import {
  checkUsageLimit,
  estimateTokens,
  initializeUsageSchema,
  recordUsage,
} from "./safety/usage-policy.js";
import { redactTranscript } from "./transcript-safety.js";
import { scrubAttachments, scrubForPersistence } from "./privacy/dlp.js";
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
import { verifyAgentConnectionToken } from "./auth/connection-token.js";

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

import { executeLlmAttempts, isCodexProviderId, resolveBareModelName } from "./llm/attempts.js";
import { authorizeTurnExecution } from "./llm/rollout.js";
// Re-exported so existing import sites (tests, compat) keep working —
// the canonical definitions live in llm/attempts.ts (H-02 executor).
export { isCodexProviderId, resolveBareModelName } from "./llm/attempts.js";

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
      // Part B: memory, sessions, prefs and turn counters (idempotent).
      try {
        initializeMemorySchema(state.storage.sql as unknown as MemorySql);
        initializeSessionSchema(state.storage.sql as unknown as MemorySql);
      } catch {
        // Memory is best-effort: turns work without it.
      }
    }
  }

  /** DO SQLite handle or null (tests, degraded storage). */
  private memorySql(): MemorySql | null {
    const sql = this.state?.storage?.sql as unknown as MemorySql | undefined;
    return sql && typeof sql.exec === 'function' ? sql : null;
  }

  /** Loads the injected MEMÓRIA DO USUÁRIO block (null when disabled/empty). */
  private loadMemoryContext(workspaceId: string, actorId: string, query: string): string | null {
    const sql = this.memorySql();
    if (!sql || !isMemoryEnabled(sql, workspaceId)) return null;
    try {
      const items = recallMemories(sql, { workspaceId, actor: actorId, query });
      return renderMemoryBlock(items);
    } catch {
      return null;
    }
  }

  /** SDK history as plain turns for compaction/context building. */
  private sdkTurns(): Array<{ role: 'user' | 'assistant'; content: string }> {
    return toContextTurns(
      (Array.isArray(this.messages) ? this.messages : []).map((message) => {
        const parts = Array.isArray(message.parts) ? message.parts : [];
        return {
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join(''),
        };
      }),
    );
  }

  /**
   * H-03: per-turn authority re-verification (epoch + rollout/canary),
   * applied on BOTH legs right after the snapshot resolves and before any
   * attempt executes. A bumped epoch invalidates the cached row and aborts
   * the turn; `disabled` blocks; canary non-cohort promotes the fallback.
   */
  private async authorizeTurn(
    snapshot: IntentionSnapshotRow,
    input: { workspaceId: string; actorId: string; intentionId: string },
  ): Promise<IntentionSnapshotRow> {
    const apiOrigin = this.env?.API_ORIGIN ?? "https://api.synkroo.com.br";
    const configToken = this.env?.AGENT_CONFIG_TOKEN ?? "";
    return authorizeTurnExecution({
      snapshot,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      intentionId: input.intentionId,
      fetchConfig: () => fetchRuntimeConfig(apiOrigin, configToken),
      deleteCachedSnapshot: () => {
        try {
          this.state?.storage?.sql?.exec(`DELETE FROM intention_snapshots WHERE intention_id = ?`, snapshot.intention_id);
        } catch {
          // Best effort: the abort below enforces the revocation.
        }
      },
      onAuthorityUnreachable: (err) => {
        console.warn(`llm.rollout authority unreachable intention=${input.intentionId}: ${(err as Error)?.message ?? err}`);
      },
    });
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
    // C-06 trust boundary: the SDK direct leg carries NO transport identity.
    // `payload.actorId` is a gateway-stamped hint, NEVER a source of
    // identity — the Worker gateway compares any client-supplied actorId
    // against the authenticated actor (403 on mismatch) before this code is
    // reachable, and the REST legs derive identity from verified headers.
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

    // H-03: epoch + rollout/canary re-verified per turn before any attempt.
    let activeSnapshot: IntentionSnapshotRow;
    try {
      activeSnapshot = await this.authorizeTurn(snapshot, { workspaceId: 'direct', actorId, intentionId });
    } catch (turnErr) {
      if ((turnErr as { code?: string })?.code === 'agent.security_epoch_changed') {
        return { text: "Configuração de IA atualizada durante o turno. Tente de novo." };
      }
      return { text: "TED ready: provider not configured" };
    }

    try {
      // H-02: the direct leg runs inside the unified attempts executor —
      // concrete upstream pairs, one primary + one distinct fallback,
      // retryable-only failover. Unresolvable snapshots fail closed.
      const runDirect = async (target: { providerId: string; modelName: string }) => {
        const providerId = target.providerId;
        const modelId = target.modelName;
        // Cognitive layer (Parts A+B, item 15): versioned persona + skills +
        // playbook + workspace memory assembled per turn, with the model's
        // tools actually wired.
        const sql = this.memorySql();
        const memoryWorkspace = 'direct';
        const memoryContext = sql ? this.loadMemoryContext(memoryWorkspace, actorId, text) : null;
        const cognition = assembleCognition(text, {
          webEnv: (this.env ?? {}) as Record<string, string | undefined>,
          ...(memoryContext ? { hooks: { memoryContext } } : {}),
        });
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
          activeSnapshot.protocol as Protocol,
          (this.env ?? {}) as Record<string, string | undefined>,
        );
        const memoryTools = sql ? buildMemoryTools({ sql, workspaceId: memoryWorkspace, actorId }) : {};
        const exposedTools = buildExposedTools(
          cognition.toolNames,
          {
            apiOrigin: this.env?.API_ORIGIN,
            workspaceId: 'direct',
            actorId,
            intentionId,
            lastUserMessage: text,
            webEnv: (this.env ?? {}) as Record<string, string | undefined>,
          },
          memoryTools,
        );
        // Compacted context: summaries replace old turns sent to the model
        // (stored history is preserved untouched).
        const historyTurns = this.sdkTurns();
        const compaction = await compactContext(historyTurns, {
          summarize: async (turns) => {
            const transcript = turns.map((turn) => `${turn.role === 'user' ? 'Usuário' : 'TED'}: ${turn.content}`).join('\n');
            const summary = await generateText({
              model: modelInstance.model,
              system: 'Resuma a conversa abaixo em até 500 caracteres, em pt-BR, preservando fatos, valores e decisões.',
              prompt: transcript,
              maxOutputTokens: 400,
            });
            return summary.text;
          },
        });
        if (compaction.compacted && sql && compaction.summary) {
          try {
            rememberFact(sql, {
              workspaceId: memoryWorkspace,
              actor: '',
              kind: 'summary',
              content: compaction.summary,
              salience: 0.7,
            });
          } catch {
            // Summary persistence is best-effort.
          }
        }
        return streamText({
          model: modelInstance.model,
          system: cognition.system,
          messages: [...compaction.context, { role: 'user' as const, content: text }],
          tools: exposedTools,
          stopWhen: stepCountIs(5),
        });
      };
      const outcome = await executeLlmAttempts({
        snapshot: activeSnapshot,
        intentionId,
        runLeg: (target) => runDirect(target),
      });
      logFailoverEvent(
        {
          intentionId,
          primaryProviderId: outcome.primary.providerId,
          primaryModelId: outcome.primary.modelName,
          fallbackProviderId: outcome.fallback?.providerId ?? activeSnapshot.fallback_provider_id,
          fallbackModelId: outcome.fallback?.modelName ?? activeSnapshot.fallback_model_id,
        },
        outcome,
      );

      // H-14: same post-inference re-verification as the relay leg — a
      // revocation during inference blocks publication of the result.
      try {
        await this.authorizeTurn(activeSnapshot, { workspaceId: 'direct', actorId, intentionId });
      } catch (postErr) {
        if ((postErr as { code?: string })?.code === 'agent.security_epoch_changed') {
          return { text: "Configuração de IA atualizada durante o turno. Tente de novo." };
        }
        return { text: "TED ready: provider not configured" };
      }

      const result = outcome.result;

      if (this.state?.storage?.sql) {
        recordUsage(this.state.storage.sql, actorId, intentionId, estimatedTokens, estimatedTokens);
      }

      // Part B: post-turn learning (heuristic every turn, cheap LLM
      // extraction every 5th). Never breaks the turn; assistant text is
      // unavailable before streaming, so the heuristic reads the user turn.
      const learnSql = this.memorySql();
      if (learnSql) {
        try {
          const turnCount = bumpTurnCount(learnSql, 'direct');
          await learnFromTurn(learnSql, {
            workspaceId: 'direct',
            actorId,
            userText: text,
            assistantText: '',
            turnCount,
            llmExtract: async (transcript) => {
              try {
                const learnModel = createLanguageModel(
                  outcome.primary.providerId,
                  outcome.primary.modelName,
                  activeSnapshot.protocol as Protocol,
                  (this.env ?? {}) as Record<string, string | undefined>,
                );
                const extracted = await generateText({
                  model: learnModel.model,
                  system: 'Extraia até 2 aprendizados duráveis sobre a pessoa (preferências, contas, categorias, metas). Responda só com os itens, um por linha, em pt-BR. Se não houver nada durável, responda vazio.',
                  prompt: transcript,
                  maxOutputTokens: 300,
                });
                return extracted.text.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 2);
              } catch {
                return [];
              }
            },
          });
        } catch {
          // Learning is best-effort.
        }
      }

      return result;
    } catch (err) {
      if ((err as { code?: string })?.code === 'agent.provider_not_configured') {
        return { text: "TED ready: provider not configured" };
      }
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

  /**
   * H-07: binds the Worker-stamped identity headers to the verified
   * connection token. Spoofed or cross-workspace headers fail even if a
   * misconfigured gateway ever forwarded them. Returns null when the check
   * passes (or does not apply: cookie-authenticated callers carry no token).
   */
  private async assertConnectionBinding(request: Request): Promise<Response | null> {
    const connToken = request.headers.get("x-agent-connection-token")?.trim();
    const secret = this.env?.AGENT_CONNECTION_TOKEN_SECRET;
    if (!connToken || !secret) return null;
    let claims: { sub: string; workspace: string; deviceId?: unknown };
    try {
      claims = await verifyAgentConnectionToken(connToken, secret);
    } catch {
      return Response.json({ code: "agent.workspace_forbidden", message: "Invalid connection token" }, { status: 403 });
    }
    const actorId = request.headers.get("x-agent-actor") ?? "";
    const workspaceId = request.headers.get("x-agent-workspace") ?? "";
    if (!actorId || !workspaceId || claims.sub !== actorId || claims.workspace !== workspaceId) {
      return Response.json(
        { code: "agent.identity_mismatch", message: "Authenticated identity does not match request context" },
        { status: 403 },
      );
    }
    // H-12: the stamped device must equal the token-bound device. The Worker
    // overwrites any client-sent x-agent-device, so a mismatch here means a
    // forged direct-DO call (token of device A presented as device B).
    const stampedDevice = request.headers.get("x-agent-device")?.trim() || undefined;
    const boundDevice = typeof claims.deviceId === "string" && claims.deviceId ? claims.deviceId : undefined;
    if (boundDevice !== undefined || stampedDevice !== undefined) {
      if (boundDevice === undefined || stampedDevice === undefined || boundDevice !== stampedDevice) {
        return Response.json(
          { code: "agent.identity_mismatch", message: "Device binding does not match request context" },
          { status: 403 },
        );
      }
    }
    return null;
  }

  private async enqueueChat<T>(task: () => Promise<T>): Promise<T> {
    const prev = this.chatQueue ?? Promise.resolve();
    const next = prev.then(() => task(), () => task());
    this.chatQueue = next;
    return next;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // H-07 defense in depth: the gateway authenticates and stamps
    // x-agent-actor/workspace, but the DO never trusts those headers alone
    // when the connection token is present — the token signature is
    // re-verified here and its claims must match the stamped identity.
    // (Signature-only: single-use consumption already happened at the
    // gateway, so this performs no network call.)
    if (url.pathname.startsWith("/rpc/")) {
      const bindingError = await this.assertConnectionBinding(request);
      if (bindingError) return bindingError;
    }
    if (url.pathname === "/rpc/chat" && request.method === "POST") {
      const actorId = request.headers.get("x-agent-actor");
      const workspaceId = request.headers.get("x-agent-workspace");
      if (!actorId || !workspaceId || !actorId.trim() || !workspaceId.trim()) {
        return Response.json({ code: "agent.unauthorized", message: "Missing authenticated actor or workspace" }, { status: 401 });
      }
      // C-06: effective identity — built ONCE from the gateway-verified
      // headers (assertConnectionBinding already ran above) and frozen.
      // Any `actorId`/`actor_id` field in the client JSON body is IGNORED
      // for identity (spoof-tested): memory, tools, audit, export and
      // compaction only ever receive this struct's fields.
      const identity = Object.freeze({
        actorId,
        workspaceId,
        role: (request.headers.get("x-agent-role") === "owner" ? "owner" : "member") as "owner" | "member",
      });
      // H-12: device binding — gateway-stamped (x-agent-device) and
      // cross-checked against the connection token claims in
      // assertConnectionBinding above; never a free client header.
      const deviceHeader = request.headers.get("x-agent-device")?.trim();
      const deviceId = deviceHeader ? deviceHeader : undefined;

      let body: { text?: unknown; content?: unknown; intentionId?: unknown; attachments?: unknown };
      try {
        body = (await request.json()) as { text?: unknown; content?: unknown; intentionId?: unknown; attachments?: unknown };
      } catch {
        return Response.json({ code: "agent.invalid_message" }, { status: 400 });
      }
      const rawText = typeof body.text === "string" ? body.text : (typeof body.content === "string" ? body.content : "");
      const unredactedText = rawText.trim();
      // H-09: attachments persist as METADATA ONLY — inline content and
      // data: URLs are dropped before anything becomes durable.
      const { attachments: incomingAttachments } = scrubAttachments(body.attachments);
      if (!unredactedText && incomingAttachments.length === 0) return Response.json({ code: "agent.invalid_message" }, { status: 400 });
      // H-09: central DLP scrub before the text becomes durable (transcript,
      // memory, summary, learning, export all read this value downstream).
      const text = unredactedText ? scrubForPersistence(unredactedText) : incomingAttachments.length > 0 ? `[anexo ${incomingAttachments.map((a) => a.name).join(", ")}]` : "";
      const intentionId = typeof body.intentionId === "string" && body.intentionId.trim()
        ? body.intentionId.trim()
        : `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      return this.enqueueChat(async () => {
        const snapshot = await this.resolveIntentionSnapshot(intentionId);
        if (!snapshot) {
          return Response.json({ code: "agent.provider_not_configured", message: "Nenhum provedor de IA ativo configurado." }, { status: 503 });
        }

        // H-03: epoch + rollout/canary re-verified per turn before any
        // attempt — a bumped epoch aborts (stream cancel), `disabled`
        // blocks, canary non-cohort promotes the fallback pair.
        let activeSnapshot: IntentionSnapshotRow;
        try {
          activeSnapshot = await this.authorizeTurn(snapshot, { workspaceId: identity.workspaceId, actorId: identity.actorId, intentionId });
        } catch (turnErr) {
          const turnCode = (turnErr as { code?: string })?.code;
          if (turnCode === 'agent.security_epoch_changed') {
            return Response.json(
              { code: 'agent.security_epoch_changed', message: 'Configuração de IA revogada durante o turno. Tente de novo.' },
              { status: 409 },
            );
          }
          return Response.json({ code: "agent.provider_not_configured", message: "Nenhum provedor de IA ativo configurado." }, { status: 503 });
        }

        if (this.state?.storage?.sql) {
          const budgetCheck = checkUsageLimit(this.state.storage.sql, identity.actorId, estimateTokens(text));
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
            actorId: identity.actorId,
            workspaceId: identity.workspaceId,
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
              // Criar token delegado workspace-isolado para chamadas de ferramentas.
              // C-03 least-privilege: o enriquecimento do relay executa
              // SOMENTE leituras (get_balance, extratos, metas, orçamentos,
              // faturas); sem financial.write a API nega qualquer escrita
              // (fail-closed via auth.delegation_scope_forbidden).
              // C-06: actor/workspace/role vêm da identidade efetiva (nunca
              // do body do cliente); H-12: deviceId quando o gateway o
              // carimbou (ver x-agent-device).
              const delegatedToken = await createDelegatedTurnToken(
                {
                  actorId: identity.actorId,
                  workspaceId: identity.workspaceId,
                  role: identity.role,
                  capabilities: ["financial.read"],
                  requestId: intentionId,
                  ...(deviceId ? { deviceId } : {}),
                },
                delegationSecret,
              );
              setGlobalApiContext({ delegatedToken, apiOrigin: relayOrigin });

              // Heurística leve para chamar ferramentas relevantes antes do LLM, garantindo que TED não negue acesso
              const lower = text.toLowerCase();
              const toolCalls: Array<{ name: string; params: Record<string, unknown> }> = [];
              if (/(saldo|balance|conta|accounts)/i.test(lower)) toolCalls.push({ name: "get_balance", params: { householdId: identity.workspaceId } });
              if (/(transa[çc][aã]o|extrato|gastos|despesa|transactions)/i.test(lower)) toolCalls.push({ name: "list_recent_transactions", params: { householdId: identity.workspaceId, limit: 10 } });
              if (/(meta|goal)/i.test(lower)) toolCalls.push({ name: "list_goals", params: { householdId: identity.workspaceId } });
              if (/(or[çc]amento|budget)/i.test(lower)) toolCalls.push({ name: "list_budgets", params: { householdId: identity.workspaceId } });
              if (/(cart[aã]o|fatura|statement|cartao)/i.test(lower)) toolCalls.push({ name: "list_statements", params: { householdId: identity.workspaceId } });
              if (toolCalls.length === 0) {
                // Fallback: sempre oferecer contexto mínimo para evitar "sem autorização"
                toolCalls.push({ name: "get_balance", params: { householdId: identity.workspaceId } });
                toolCalls.push({ name: "list_recent_transactions", params: { householdId: identity.workspaceId, limit: 5 } });
              }
              // Executar até 2 ferramentas para não estourar tempo, com fail-open
              for (const call of toolCalls.slice(0, 2)) {
                const tool = generatedHttpTools.find((t) => t.name === call.name);
                if (!tool) continue;
                try {
                  const result = await (tool.execute as unknown as (p: Record<string, unknown>) => Promise<unknown>)(call.params);
                  const snippet = JSON.stringify(result).slice(0, 800);
                  // Enriquecer prompt com resultado da ferramenta (isolado por workspace)
                  enrichedPrompt += `\n\n[Dados da ferramenta ${call.name} (workspace ${identity.workspaceId}): ${snippet}]`;
                } catch {
                  // fail-open: não bloquear chat se ferramenta falhar
                }
              }
            }
          } catch {
            // fail-open para enriquecimento
          }

          // H-02: buffered leg runs inside the SAME attempts executor as the
          // direct leg — concrete upstream pairs (bare names, never row ids),
          // one primary + one distinct fallback, retryable-only failover and
          // a sanitized composite error when both legs fail.
          //
          // Cognitive layer for the relay leg too: persona + skills +
          // playbook + workspace memory travel as the system prompt (the
          // relay has no tool loop, so the enriched prompt keeps carrying
          // workspace data).
          const relaySql = this.memorySql();
          const relayMemoryContext = relaySql ? this.loadMemoryContext(identity.workspaceId, identity.actorId, text) : null;
          const cognition = assembleCognition(text, {
            webEnv: (this.env ?? {}) as Record<string, string | undefined>,
            ...(relayMemoryContext ? { hooks: { memoryContext: relayMemoryContext } } : {}),
          });
          const runBufferedLeg = async (
            target: { providerId: string; modelName: string },
            attempt: 'primary' | 'fallback',
            signal?: AbortSignal,
          ): Promise<string> => {
            if (isCodexProviderId(target.providerId)) {              // Codex executes via the private broker (browser-session
              // auth), never via relay HTTP. Broker errors already carry
              // { code, status } for the shared classification below.
              return runCodexBrokerText((this.env ?? {}) as CodexBrokerEnv, {
                model: target.modelName,
                prompt: enrichedPrompt,
                system: cognition.system,
                requestId: attempt === 'primary' ? intentionId : `${intentionId}:fallback`,
                intentionId,
                workspaceId: identity.workspaceId,
                actorId: identity.actorId,
              });
            }
            const relayRes = await fetch(`${relayOrigin.replace(/\/$/, "")}/internal/agent/llm-relay`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-agent-runtime-admin-token": adminToken,
              },
              // H-14: abortable — a revocation detected post-inference
              // cancels the in-flight relay call.
              ...(signal ? { signal } : {}),
              body: JSON.stringify({
                provider: target.providerId,
                model: target.modelName,
                prompt: enrichedPrompt,
                system: cognition.system,
              }),
            });
            const relayRaw = await relayRes.text().catch(() => "");
            let relayBody: { text?: string; code?: string; message?: string };
            try { relayBody = JSON.parse(relayRaw || "{}") as { text?: string; code?: string; message?: string }; } catch { relayBody = {}; }
            if (!relayRes.ok || typeof relayBody.text !== "string" || !relayBody.text) {
              throw Object.assign(
                new Error(redactTranscript(relayBody.message ?? `HTTP ${relayRes.status}`).slice(0, 200)),
                { status: relayRes.status, code: relayBody.code ?? `http_${relayRes.status}` },
              );
            }
            return relayBody.text;
          };

          let attemptOutcome: Awaited<ReturnType<typeof executeLlmAttempts<string>>>;
          // H-14: per-turn abort scope — a post-inference revocation aborts
          // the in-flight relay HTTP and blocks publication below.
          const turnAbort = new AbortController();
          try {
            attemptOutcome = await executeLlmAttempts<string>({
              snapshot: activeSnapshot,
              intentionId,
              runLeg: (target, attempt) => runBufferedLeg(target, attempt, turnAbort.signal),
            });
          } catch (attemptErr) {
            const attemptCode = (attemptErr as { code?: string })?.code;
            if (attemptCode === 'agent.provider_not_configured') {
              return Response.json(
                { code: 'agent.provider_not_configured', message: 'Nenhum provedor de IA ativo configurado.' },
                { status: 503 },
              );
            }
            const rawStatus = (attemptErr as { status?: number })?.status;
            const status = typeof rawStatus === 'number' && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 502;
            const safeMessage = redactTranscript((attemptErr as Error)?.message ?? 'Falha ao processar a inferência.');
            return Response.json(
              {
                code: attemptCode ?? 'agent.inference_error',
                message: safeMessage,
                provider: activeSnapshot.provider_id,
                model: activeSnapshot.model_id,
                ...((attemptErr as { primaryReason?: string })?.primaryReason
                  ? { primaryReason: (attemptErr as { primaryReason?: string }).primaryReason }
                  : {}),
                ...((attemptErr as { fallbackReason?: string })?.fallbackReason
                  ? { fallbackReason: (attemptErr as { fallbackReason?: string }).fallbackReason }
                  : {}),
              },
              { status },
            );
          }

          // H-14: epoch/version are compared AGAIN after inference, before
          // anything is persisted or published. A bump, a `disabled`
          // rollout or an unreachable authority aborts the turn: the revoked
          // output is never persisted and never returned. (The
          // pre-inference user message stays — it was authorized when
          // written and contains no model output.)
          try {
            await this.authorizeTurn(activeSnapshot, { workspaceId: identity.workspaceId, actorId: identity.actorId, intentionId });
          } catch (postErr) {
            turnAbort.abort();
            if ((postErr as { code?: string })?.code === 'agent.security_epoch_changed') {
              return Response.json(
                { code: 'agent.security_epoch_changed', message: 'Configuração de IA revogada durante o turno. Tente de novo.' },
                { status: 409 },
              );
            }
            return Response.json({ code: "agent.provider_not_configured", message: "Nenhum provedor de IA ativo configurado." }, { status: 503 });
          }

          const usedFallback = attemptOutcome.usedFallback;
          const effectiveProvider = usedFallback
            ? (activeSnapshot.fallback_provider_id ?? activeSnapshot.provider_id)
            : snapshot.provider_id;
          const effectiveModel = usedFallback
            ? (activeSnapshot.fallback_model_id ?? activeSnapshot.model_id)
            : snapshot.model_id;

          // Structured failover metric (no secrets).
          logFailoverEvent(
            {
              intentionId,
              primaryProviderId: attemptOutcome.primary.providerId,
              primaryModelId: attemptOutcome.primary.modelName,
              fallbackProviderId: attemptOutcome.fallback?.providerId ?? activeSnapshot.fallback_provider_id,
              fallbackModelId: attemptOutcome.fallback?.modelName ?? activeSnapshot.fallback_model_id,
            },
            attemptOutcome,
          );

          const output = redactTranscript(attemptOutcome.result);

          if (this.state?.storage?.sql) {
            recordUsage(this.state.storage.sql, identity.actorId, intentionId, estimateTokens(text), estimateTokens(output));
          }

          // Persist Assistant TED message (redacted) AFTER relay response
          const assistantCreatedAt = new Date().toISOString();
          const assistantMsg: UIMessage = {
            id: `msg-asst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            role: "assistant",
            parts: [{ type: "text", text: output }],
            metadata: {
              actorId: "ted",
              workspaceId: identity.workspaceId,
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

          // Part B: post-turn learning (heuristic only on the relay leg —
          // no extra inference cost). New learnings ride the response so
          // the PWA can toast "TED memorizou: ...".
          let memorized: string[] = [];
          if (relaySql) {
            try {
              const turnCount = bumpTurnCount(relaySql, identity.workspaceId);
              const learned = await learnFromTurn(relaySql, {
                workspaceId: identity.workspaceId,
                actorId: identity.actorId,
                userText: text,
                assistantText: output,
                turnCount,
              });
              memorized = learned.map((item) => item.content);
            } catch {
              // Learning is best-effort.
            }
          }

          return Response.json({
            turnId: intentionId,
            intentionId,
            status: "completed",
            output,
            workspaceId,
            provider: activeSnapshot.provider_id,
            model: activeSnapshot.model_id,
            memorized,
          });
        } catch (err) {
          const message = (err as Error)?.message ?? "Erro desconhecido ao processar inferência.";
          return Response.json({ code: "agent.inference_error", message: redactTranscript(message) }, { status: 502 });
        }
      });
    }

    // Part B: memory privacy toggle (workspace-scoped, ON by default).
    if (url.pathname === "/rpc/memory/prefs" && request.method === "POST") {
      const actorId = request.headers.get("x-agent-actor");
      const workspaceId = request.headers.get("x-agent-workspace");
      if (!actorId || !workspaceId || !actorId.trim() || !workspaceId.trim()) {
        return Response.json({ code: "agent.unauthorized", message: "Missing authenticated actor or workspace" }, { status: 401 });
      }
      // C-06: frozen effective identity (headers verified by the gateway).
      const identity = Object.freeze({ actorId, workspaceId });
      const sql = this.memorySql();
      if (!sql) {
        return Response.json({ code: "agent.persistence_unavailable", message: "Memory storage is not available" }, { status: 503 });
      }
      let enabled = true;
      try {
        const body = (await request.json()) as { enabled?: unknown };
        if (typeof body.enabled !== 'boolean') {
          return Response.json({ code: "agent.invalid_message" }, { status: 400 });
        }
        enabled = body.enabled;
      } catch {
        return Response.json({ code: "agent.invalid_message" }, { status: 400 });
      }
      setMemoryEnabled(sql, identity.workspaceId, enabled);
      return Response.json({ ok: true, enabled });
    }

    // Part B: "Nova sessão" — archives the current session (count + best-
    // effort summary) into the registry, clears the model context (SDK
    // messages), and starts a fresh session. Stored history rows are
    // preserved in the registry summary; durable memories are untouched.
    if (url.pathname === "/rpc/session/new" && request.method === "POST") {
      const actorId = request.headers.get("x-agent-actor");
      const workspaceId = request.headers.get("x-agent-workspace");
      if (!actorId || !workspaceId || !actorId.trim() || !workspaceId.trim()) {
        return Response.json({ code: "agent.unauthorized", message: "Missing authenticated actor or workspace" }, { status: 401 });
      }
      // C-06: frozen effective identity (headers verified by the gateway).
      const identity = Object.freeze({ actorId, workspaceId });
      const sql = this.memorySql();
      if (!sql) {
        return Response.json({ code: "agent.persistence_unavailable", message: "Session storage is not available" }, { status: 503 });
      }
      const turns = this.sdkTurns();
      const messageCount = turns.length;
      let summary: string | null = null;
      if (messageCount > 0) {
        try {
          summary = extractiveSummary(turns);
        } catch {
          summary = null;
        }
      }
      // Ensure a registry row exists even for the very first session, so the
      // archived history is never lost when no session was opened before.
      // Empty renewals only reset the context without archiving noise.
      let previous: { id: string } | null = null;
      if (messageCount > 0) {
        currentSession(sql, identity.workspaceId, identity.actorId);
        previous = endSession(sql, identity.workspaceId, identity.actorId, {
          ...(summary ? { summary } : {}),
          messageCount,
        });
      }
      try {
        // SDK coupling (documented): the messages table is SDK-internal.
        sql.exec(`DELETE FROM cf_ai_chat_agent_messages`);
      } catch {
        // Best effort: a fresh session id is still returned.
      }
      if (Array.isArray(this.messages)) this.messages.length = 0;
      const next = currentSession(sql, identity.workspaceId, identity.actorId);
      return Response.json({
        ok: true,
        sessionId: next.id,
        previousSessionId: previous?.id ?? null,
        messageCount,
        summarized: summary !== null,
      });
    }

    if (url.pathname === "/rpc/history" && request.method === "GET") {
      const actorId = request.headers.get("x-agent-actor");
      const workspaceId = request.headers.get("x-agent-workspace");
      if (!actorId || !workspaceId || !actorId.trim() || !workspaceId.trim()) {
        return Response.json({ code: "agent.unauthorized", message: "Missing authenticated actor or workspace" }, { status: 401 });
      }
      // C-06: frozen effective identity (headers verified by the gateway).
      const identity = Object.freeze({ actorId, workspaceId });

      const allMessages = Array.isArray(this.messages) ? this.messages : [];
      // Isolamento por workspace: filtrar mensagens cujo workspaceId difere (defesa em profundidade, DO já é por workspace)
      const rawMessages = allMessages.filter((msg) => {
        const ws = (msg.metadata as { workspaceId?: string } | undefined)?.workspaceId;
        return !ws || ws === identity.workspaceId;
      });

      const items = rawMessages.map((msg) => {
        const msgActorId = (msg.metadata as { actorId?: string } | undefined)?.actorId ?? (msg.role === "assistant" ? "ted" : "unknown");
        let contentText = "";
        if (Array.isArray(msg.parts)) {
          contentText = msg.parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
        }
        const isOwn = msg.role === "user" && msgActorId === identity.actorId;
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
        migrationHash: computeHistoryHash(exportData.messages, exportData.workspaceId),
      };
    });
  }
}
