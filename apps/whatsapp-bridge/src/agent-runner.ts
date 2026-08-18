import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";

export interface AgentRunnerOptions {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  spawnFn?: (command: string, args: string[], options: Record<string, unknown>) => ChildProcess;
}

export interface AgentMessageContext {
  source: string;
  chatId: string;
  providerMessageId: string;
  householdId?: string;
  senderPhone?: string;
  contextToken?: string;
  idempotencyKey?: string;
}

export interface AgentResponse {
  success: boolean;
  text?: string;
  reason?: string;
}

export class AgentRunner extends EventEmitter {
  private child: ChildProcess | null = null;
  private running = false;
  private pendingResolvers = new Map<string, {
    resolve: (res: AgentResponse) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  private nextMessageId = 1;
  private readonly options: Required<Omit<AgentRunnerOptions, "spawnFn">> & { spawnFn: typeof spawn };

  constructor(options: AgentRunnerOptions = {}) {
    super();
    this.options = {
      command: options.command ?? "pi",
      args: options.args ?? ["--mode", "rpc"],
      cwd: options.cwd ?? process.cwd(),
      env: { ...process.env, ...options.env },
      timeoutMs: options.timeoutMs ?? 30000,
      spawnFn: options.spawnFn ?? spawn,
    };
  }

  public isRunning(): boolean {
    return this.running && this.child !== null && !this.child.killed;
  }

  public start(): void {
    if (this.isRunning()) return;

    try {
      this.child = this.options.spawnFn(this.options.command, this.options.args, {
        cwd: this.options.cwd,
        env: this.options.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      this.running = true;

      if (this.child.stdout) {
        const rl = createInterface({ input: this.child.stdout });
        rl.on("line", (line) => this.handleStdoutLine(line));
      }

      if (this.child.stderr) {
        this.child.stderr.on("data", (chunk: Buffer) => {
          this.emit("stderr", chunk.toString("utf8"));
        });
      }

      this.child.on("error", (err) => {
        this.emit("error", err);
        this.cleanup(err);
      });

      this.child.on("exit", (code, signal) => {
        const err = new Error(`Agent process exited with code ${code} (signal: ${signal})`);
        this.emit("exit", { code, signal });
        this.cleanup(err);
      });
    } catch (err) {
      this.running = false;
      this.child = null;
      throw err;
    }
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      this.emit("malformed_output", trimmed);
      return;
    }

    const id = parsed.id ?? parsed.messageId;
    if (id && this.pendingResolvers.has(String(id))) {
      const { resolve, timer } = this.pendingResolvers.get(String(id))!;
      clearTimeout(timer);
      this.pendingResolvers.delete(String(id));

      if (parsed.type === "error" || parsed.success === false) {
        resolve({
          success: false,
          reason: parsed.reason ?? parsed.error ?? parsed.message ?? "Agent error",
          text: parsed.text,
        });
      } else {
        resolve({
          success: true,
          text: parsed.text ?? parsed.response ?? parsed.data?.message ?? parsed.content ?? "",
        });
      }
      return;
    }

    // Unsolicited or generic response fallback
    if (this.pendingResolvers.size === 1) {
      const [singleId, { resolve, timer }] = this.pendingResolvers.entries().next().value!;
      clearTimeout(timer);
      this.pendingResolvers.delete(singleId);
      resolve({
        success: parsed.success !== false,
        text: parsed.text ?? parsed.response ?? parsed.data?.message ?? parsed.content ?? "",
        reason: parsed.reason,
      });
    }
  }

  public async sendMessage(
    content: string,
    context?: AgentMessageContext,
    timeoutOverrideMs?: number,
  ): Promise<AgentResponse> {
    if (!this.isRunning()) {
      this.start();
    }

    const messageId = String(this.nextMessageId++);
    const timeoutMs = timeoutOverrideMs ?? this.options.timeoutMs;

    const payload = {
      id: messageId,
      type: "message",
      content,
      context: {
        ...context,
        timestamp: new Date().toISOString(),
      },
    };

    return new Promise<AgentResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResolvers.delete(messageId);
        resolve({
          success: false,
          reason: `Agent request timed out after ${timeoutMs}ms`,
          text: "❌ O assistente demorou muito para responder. Tente novamente em instantes.",
        });
      }, timeoutMs);

      this.pendingResolvers.set(messageId, { resolve, reject, timer });

      try {
        if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
          clearTimeout(timer);
          this.pendingResolvers.delete(messageId);
          resolve({
            success: false,
            reason: "Agent stdin stream unavailable",
            text: "❌ Falha na conexão com o assistente.",
          });
          return;
        }

        this.child.stdin.write(JSON.stringify(payload) + "\n", "utf8", (err) => {
          if (err) {
            clearTimeout(timer);
            this.pendingResolvers.delete(messageId);
            resolve({
              success: false,
              reason: `Failed to write to agent stdin: ${err.message}`,
              text: "❌ Falha ao enviar mensagem ao assistente.",
            });
          }
        });
      } catch (err: any) {
        clearTimeout(timer);
        this.pendingResolvers.delete(messageId);
        resolve({
          success: false,
          reason: err?.message ?? "Error writing to agent stdin",
          text: "❌ Erro interno no assistente.",
        });
      }
    });
  }

  private cleanup(exitError: Error): void {
    this.running = false;
    for (const [id, { resolve, timer }] of this.pendingResolvers.entries()) {
      clearTimeout(timer);
      resolve({
        success: false,
        reason: exitError.message,
        text: "❌ O processo do assistente foi reiniciado. Tente enviar sua mensagem novamente.",
      });
    }
    this.pendingResolvers.clear();
    this.child = null;
  }

  public async stop(): Promise<void> {
    if (!this.child) {
      this.running = false;
      return;
    }

    return new Promise<void>((resolve) => {
      const proc = this.child;
      this.running = false;
      this.child = null;

      if (!proc || proc.killed) {
        resolve();
        return;
      }

      const forceKillTimer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve();
      }, 2000);

      proc.once("exit", () => {
        clearTimeout(forceKillTimer);
        resolve();
      });

      try {
        proc.kill("SIGTERM");
      } catch {
        clearTimeout(forceKillTimer);
        resolve();
      }
    });
  }
}
