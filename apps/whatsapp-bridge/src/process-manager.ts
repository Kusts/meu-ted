import { AgentRunner, type AgentRunnerOptions, type AgentResponse } from "./agent-runner.js";
import type { PiClient } from "./webhook-handler.js";

export interface ProcessManagerOptions {
  runnerOptions?: AgentRunnerOptions;
  maxConcurrent?: number;
  maxRestarts?: number;
  backoffInitialMs?: number;
}

export class ProcessManager implements PiClient {
  private runners = new Map<string, AgentRunner>();
  private restartCounts = new Map<string, number>();
  private activeExecutions = 0;
  private readonly maxConcurrent: number;
  private readonly maxRestarts: number;
  private readonly backoffInitialMs: number;
  private readonly runnerOptions: AgentRunnerOptions;
  private isShuttingDown = false;

  constructor(options: ProcessManagerOptions = {}) {
    this.runnerOptions = options.runnerOptions ?? {};
    this.maxConcurrent = options.maxConcurrent ?? 5;
    this.maxRestarts = options.maxRestarts ?? 5;
    this.backoffInitialMs = options.backoffInitialMs ?? 500;
  }

  public getOrCreateRunner(key: string = "default"): AgentRunner {
    if (this.isShuttingDown) {
      throw new Error("ProcessManager is shutting down");
    }

    let runner = this.runners.get(key);
    if (!runner || !runner.isRunning()) {
      runner = new AgentRunner(this.runnerOptions);
      runner.on("exit", () => {
        this.handleRunnerExit(key);
      });
      runner.start();
      this.runners.set(key, runner);
    }
    return runner;
  }

  private handleRunnerExit(key: string): void {
    if (this.isShuttingDown) return;

    const count = (this.restartCounts.get(key) ?? 0) + 1;
    this.restartCounts.set(key, count);

    if (count <= this.maxRestarts) {
      const delay = this.backoffInitialMs * Math.pow(2, count - 1);
      setTimeout(() => {
        if (!this.isShuttingDown && (!this.runners.get(key) || !this.runners.get(key)!.isRunning())) {
          try {
            this.getOrCreateRunner(key);
          } catch {
            // ignore
          }
        }
      }, delay);
    }
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
      householdId?: string;
    },
  ): Promise<{
    success: boolean;
    reason?: string;
    data?: { message?: string };
  }> {
    if (this.isShuttingDown) {
      return {
        success: false,
        reason: "Process manager is shutting down",
        data: { message: "❌ O sistema está reiniciando. Tente novamente em instantes." },
      };
    }

    if (this.activeExecutions >= this.maxConcurrent) {
      return {
        success: false,
        reason: "Concurrency limit reached",
        data: { message: "⏳ Muitas mensagens sendo processadas no momento. Aguarde alguns segundos." },
      };
    }

    this.activeExecutions++;
    const key = context.householdId ?? "default";

    try {
      const runner = this.getOrCreateRunner(key);
      const res: AgentResponse = await runner.sendMessage(message, {
        source: context.source,
        chatId: context.chatId,
        providerMessageId: context.providerMessageId,
        senderPhone,
        contextToken: context.contextToken,
        idempotencyKey: context.idempotencyKey,
        householdId: context.householdId,
      });

      // Successful call resets restart count
      this.restartCounts.set(key, 0);

      return {
        success: res.success,
        reason: res.reason,
        data: { message: res.text },
      };
    } catch (err: any) {
      return {
        success: false,
        reason: err?.message ?? "Execution failed",
        data: { message: "❌ Ocorreu um erro ao processar sua mensagem." },
      };
    } finally {
      this.activeExecutions = Math.max(0, this.activeExecutions - 1);
    }
  }

  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    const stopPromises: Promise<void>[] = [];
    for (const runner of this.runners.values()) {
      stopPromises.push(runner.stop());
    }
    await Promise.all(stopPromises);
    this.runners.clear();
  }
}
