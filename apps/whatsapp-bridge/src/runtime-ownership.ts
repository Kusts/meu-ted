import type { PiClient } from "./webhook-handler.js";

export type RuntimeStage =
  | "pi_owner"
  | "agent_owner"
  | "agent_owner_pi_read_fallback"
  | "frozen";

export interface RuntimeConfig {
  stage: RuntimeStage;
  responder: "pi" | "agent";
  allowPiWrites: boolean;
  allowAgentWrites: boolean;
  shadowMode: "agent_read" | "none" | "pi_read_fallback" | "disabled";
}

export const STAGE_CONFIGS: Record<RuntimeStage, Omit<RuntimeConfig, "stage">> = {
  pi_owner: {
    responder: "pi",
    allowPiWrites: true,
    allowAgentWrites: false,
    shadowMode: "agent_read",
  },
  agent_owner: {
    responder: "agent",
    allowPiWrites: false,
    allowAgentWrites: true,
    shadowMode: "none",
  },
  agent_owner_pi_read_fallback: {
    responder: "agent",
    allowPiWrites: false,
    allowAgentWrites: true,
    shadowMode: "pi_read_fallback",
  },
  frozen: {
    responder: "agent",
    allowPiWrites: false,
    allowAgentWrites: true,
    shadowMode: "disabled",
  },
};

export function parseRuntimeStage(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const raw = (env.FINANCE_RUNTIME_STAGE ?? env.PI_RUNTIME_STAGE ?? "pi_owner").trim().toLowerCase();

  if (!(raw in STAGE_CONFIGS)) {
    throw new Error(
      `Invalid FINANCE_RUNTIME_STAGE: '${raw}'. Valid stages are: ${Object.keys(STAGE_CONFIGS).join(", ")}`,
    );
  }

  const stage = raw as RuntimeStage;
  return {
    stage,
    ...STAGE_CONFIGS[stage],
  };
}

export class RuntimeOwnershipRouter implements PiClient {
  constructor(
    private readonly config: RuntimeConfig,
    private readonly clients: {
      piClient: PiClient;
      agentClient: PiClient;
    },
  ) {}

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
    const primary = this.config.responder === "agent" ? this.clients.agentClient : this.clients.piClient;

    const res = await primary.send(message, senderPhone, context);

    if (
      !res.success &&
      this.config.stage === "agent_owner_pi_read_fallback" &&
      this.config.responder === "agent"
    ) {
      // Fallback to Pi for read operations if Agent failed
      const fallbackRes = await this.clients.piClient.send(message, senderPhone, context);
      if (fallbackRes.success) {
        return fallbackRes;
      }
    }

    return res;
  }
}
