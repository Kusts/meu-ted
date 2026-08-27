import { AIChatAgent } from "agents/ai-chat-agent";
import { streamText } from "ai";
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
}
