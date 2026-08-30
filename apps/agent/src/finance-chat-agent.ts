import { AIChatAgent, type UIMessage } from "agents/ai-chat-agent";
import { streamText, generateText } from "ai";
import { fetchRuntimeConfig, type RuntimeSnapshot } from "./llm/runtime-config-client.js";
import { createLanguageModel } from "./llm/model-factory.js";
import type { Protocol } from "./llm/provider-registry.js";
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
};

export type IntentionSnapshotRow = {
  intention_id: string;
  version: number;
  provider_id: string;
  model_id: string;
  protocol: string;
  rollout_percentage: number;
  security_epoch: number;
  created_at: string;
};

export const TED_SYSTEM_PROMPT = `Você é o TED, o assistente financeiro inteligente, seguro e proativo do Pi Financeiro.
Suas diretrizes fundamentais são:
1. Comunicação sempre em Português do Brasil (pt-BR), com tom profissional, encorajador, claro e objetivo.
2. Todas as informações financeiras pertencem estritamente ao workspace ativo; nunca assuma dados de terceiros.
3. Forneça respostas analíticas, projeções mensais, análises de gastos e sugestões orçamentárias fundamentadas nos dados do usuário.
4. Jamais divulgue segredos de infraestrutura, tokens ou chaves internas.`;

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
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          );
        `);
      } catch {
        // Ignored if table already exists or mock storage
      }
    }
  }

  private async resolveIntentionSnapshot(intentionId: string): Promise<IntentionSnapshotRow | null> {
    if (this.state?.storage?.sql) {
      const rows = [...this.state.storage.sql.exec<IntentionSnapshotRow>(
        `SELECT * FROM intention_snapshots WHERE intention_id = ?`,
        intentionId,
      )];
      if (rows.length > 0 && rows[0]) {
        return rows[0];
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
      created_at: new Date().toISOString(),
    };

    if (this.state?.storage?.sql) {
      try {
        this.state.storage.sql.exec(
          `INSERT INTO intention_snapshots (intention_id, version, provider_id, model_id, protocol, rollout_percentage, security_epoch, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          snapshot.intention_id,
          snapshot.version,
          snapshot.provider_id,
          snapshot.model_id,
          snapshot.protocol,
          snapshot.rollout_percentage,
          snapshot.security_epoch,
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
      const modelInstance = createLanguageModel(
        snapshot.provider_id,
        snapshot.model_id,
        snapshot.protocol as Protocol,
        (this.env ?? {}) as Record<string, string | undefined>,
      );

      const result = await streamText({
        model: modelInstance.model,
        system: TED_SYSTEM_PROMPT,
        prompt: text,
      });

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

      let body: { text?: unknown; content?: unknown; intentionId?: unknown };
      try {
        body = (await request.json()) as { text?: unknown; content?: unknown; intentionId?: unknown };
      } catch {
        return Response.json({ code: "agent.invalid_message" }, { status: 400 });
      }
      const rawText = typeof body.text === "string" ? body.text : (typeof body.content === "string" ? body.content : "");
      const unredactedText = rawText.trim();
      if (!unredactedText) return Response.json({ code: "agent.invalid_message" }, { status: 400 });
      const text = redactTranscript(unredactedText);
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
          },
        };

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
          const relayRes = await fetch(`${relayOrigin.replace(/\/$/, "")}/internal/agent/llm-relay`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-agent-runtime-admin-token": adminToken,
            },
            body: JSON.stringify({
              provider: snapshot.provider_id,
              model: snapshot.model_id,
              prompt: text,
              system: TED_SYSTEM_PROMPT,
            }),
          });
          const relayRaw = await relayRes.text().catch(() => "");
          let relayBody: { text?: string; code?: string; message?: string } = {};
          try { relayBody = JSON.parse(relayRaw || "{}") as { text?: string; code?: string; message?: string }; } catch { relayBody = {}; }
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

      const rawMessages = Array.isArray(this.messages) ? this.messages : [];

      const items = rawMessages.map((msg) => {
        const msgActorId = (msg.metadata as { actorId?: string } | undefined)?.actorId ?? (msg.role === "assistant" ? "ted" : "unknown");
        let contentText = "";
        if (Array.isArray(msg.parts)) {
          contentText = msg.parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
        }
        const isOwn = msg.role === "user" && msgActorId === actorId;
        const createdAt = (msg.metadata as { createdAt?: string } | undefined)?.createdAt ?? undefined;
        return {
          id: String(msg.id ?? `msg-${Date.now()}`),
          actorId: msgActorId,
          role: String(msg.role ?? "user"),
          content: contentText,
          text: contentText,
          createdAt: typeof createdAt === "string" ? createdAt : undefined,
          isOwn,
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
