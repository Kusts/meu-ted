import type { PiClient } from "./webhook-handler.js";

export interface AgentClientOptions {
  apiBaseUrl?: string;
  agentBaseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchFn?: typeof fetch;
}

export interface AgentClientContext {
  source: string;
  chatId: string;
  providerMessageId: string;
  idempotencyKey?: string;
  workspaceId?: string;
}

export interface BridgeContextResponse {
  success: boolean;
  delegatedToken: string;
  user: { id: string; name: string; email: string };
  workspace: { id: string; role: string };
}

export interface AgentTurnResponse {
  success: boolean;
  message?: string;
  text?: string;
  response?: string;
  error?: string;
  reason?: string;
}

export class AgentClient implements PiClient {
  private readonly apiBaseUrl: string;
  private readonly agentBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetch: typeof fetch;

  constructor(options: AgentClientOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? process.env.PI_FINANCE_API_BASE_URL ?? "http://localhost:3000";
    this.agentBaseUrl = options.agentBaseUrl ?? process.env.AGENT_BASE_URL ?? "http://localhost:8787";
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetch = options.fetchFn ?? globalThis.fetch;
  }

  public async send(
    message: string,
    senderPhone: string,
    context: {
      source: string;
      chatId: string;
      providerMessageId: string;
      idempotencyKey?: string;
      contextToken?: string;
      workspaceId?: string;
    },
  ): Promise<{
    success: boolean;
    reason?: string;
    data?: { message?: string };
  }> {
    const requestId = context.idempotencyKey ?? `whatsapp:${context.providerMessageId}`;

    // 1. Resolve server-side identity & get delegated turn token
    let bridgeCtx: BridgeContextResponse;
    try {
      bridgeCtx = await this.resolveBridgeContext({
        phone: senderPhone,
        chatId: context.chatId,
        providerMessageId: context.providerMessageId,
        requestId,
        workspaceId: context.workspaceId,
      });
    } catch (err: any) {
      return {
        success: false,
        reason: err?.message ?? "Failed to resolve bridge identity",
        data: { message: "❌ Não consegui identificar seu usuário ou workspace ativo." },
      };
    }

    // 2. Dispatch turn to Agent Worker using delegated token
    try {
      const turnResult = await this.executeAgentTurnWithRetry({
        content: message,
        delegatedToken: bridgeCtx.delegatedToken,
        requestId,
      });

      if (!turnResult.success) {
        return {
          success: false,
          reason: turnResult.reason ?? turnResult.error ?? "Agent execution failed",
          data: { message: turnResult.message ?? "❌ O assistente não conseguiu responder." },
        };
      }

      return {
        success: true,
        data: {
          message: turnResult.text ?? turnResult.response ?? turnResult.message ?? "",
        },
      };
    } catch (err: any) {
      return {
        success: false,
        reason: err?.message ?? "Agent communication failed",
        data: { message: "❌ Ocorreu uma falha na comunicação com o assistente." },
      };
    }
  }

  private async resolveBridgeContext(input: {
    phone: string;
    chatId: string;
    providerMessageId: string;
    requestId: string;
    workspaceId?: string;
  }): Promise<BridgeContextResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const url = `${this.apiBaseUrl.replace(/\/+$/, "")}/auth/bridge-context`;
      const res = await this.fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: input.phone,
          chatId: input.chatId,
          providerMessageId: input.providerMessageId,
          requestId: input.requestId,
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({})) as { code?: string; message?: string };
        throw new Error(errorBody.message ?? `Bridge context resolution failed with status ${res.status}`);
      }

      return await res.json() as BridgeContextResponse;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async executeAgentTurnWithRetry(input: {
    content: string;
    delegatedToken: string;
    requestId: string;
  }): Promise<AgentTurnResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const url = `${this.agentBaseUrl.replace(/\/+$/, "")}/turn`;
        const res = await this.fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.delegatedToken}`,
            "X-Request-ID": input.requestId,
          },
          body: JSON.stringify({
            content: input.content,
            delegatedToken: input.delegatedToken,
            requestId: input.requestId,
          }),
          signal: controller.signal,
        });

        if (res.status === 429 || res.status >= 500) {
          if (attempt < this.maxRetries) {
            const delayMs = 100 * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delayMs));
            continue;
          }
        }

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({})) as { message?: string; error?: string };
          return {
            success: false,
            reason: errJson.error ?? errJson.message ?? `Agent returned status ${res.status}`,
          };
        }

        const body = await res.json() as AgentTurnResponse;
        return {
          success: body.success !== false,
          text: body.text ?? body.response ?? body.message ?? "",
        };
      } catch (err: any) {
        lastError = err;
        if (attempt < this.maxRetries && err?.name !== "AbortError") {
          const delayMs = 100 * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new Error("Agent request failed after retries");
  }
}
