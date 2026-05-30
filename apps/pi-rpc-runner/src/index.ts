// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - Main entry point
// Coordinates process runner, JSONL client, queue, and prompt builder
// ─────────────────────────────────────────────────────────────────────────────

export { createJsonlClient, type JsonlClientOptions, type JsonlResponse } from './rpc-client.js';
export { startPiRpcProcess, stopProcess, waitForExit, isProcessRunning, type ManagedProcess, type ProcessRunnerOptions } from './process-runner.js';
export { RpcQueue, type JobResult, type QueueOptions } from './rpc-queue.js';
export { buildTedPrompt, formatCurrency, parseCurrency, type TedPromptOptions } from './ted-prompt.js';

import { createJsonlClient } from './rpc-client.js';
import { startPiRpcProcess, stopProcess, type ManagedProcess } from './process-runner.js';
import { RpcQueue } from './rpc-queue.js';
import { buildTedPrompt, type TedPromptOptions } from './ted-prompt.js';

export interface PiRpcRunnerOptions {
  piCommand?: string;
  piArgs?: string[];
  cwd?: string;
  timeoutMs?: number;
  queueOptions?: {
    timeoutMs?: number;
    maxRetries?: number;
  };
}

export interface RunResult {
  success: boolean;
  response?: string;
  toolCalls?: unknown[];
  error?: string;
  retryable: boolean;
  jobId: string;
}

/**
 * Pi RPC Runner - coordinates all components
 */
export class PiRpcRunner {
  private managedProcess: ManagedProcess | null = null;
  private queue: RpcQueue;
  private timeoutMs: number;

  constructor(options: PiRpcRunnerOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.queue = new RpcQueue({
      timeoutMs: options.queueOptions?.timeoutMs ?? this.timeoutMs,
      maxRetries: options.queueOptions?.maxRetries ?? 3,
    });
  }

  /**
   * Start the Pi RPC process
   */
  start(options: { cwd?: string } = {}): void {
    if (this.managedProcess) {
      return; // Already running
    }

    this.managedProcess = startPiRpcProcess({
      command: 'pi',
      args: ['--mode', 'rpc'],
      cwd: options.cwd || process.cwd(),
    });

    // Handle process exit
    this.managedProcess.process.on('exit', (code) => {
      console.log(`Pi RPC process exited with code ${code}`);
      this.managedProcess = null;
    });
  }

  /**
   * Stop the Pi RPC process
   */
  stop(): void {
    if (this.managedProcess) {
      stopProcess(this.managedProcess);
      this.managedProcess = null;
    }
  }

  /**
   * Run a prompt through the RPC queue
   */
  async runPrompt(promptOptions: TedPromptOptions & { cwd?: string }): Promise<RunResult> {
    if (!this.managedProcess) {
      this.start({ cwd: promptOptions.cwd });
    }

    const job = this.queue.enqueue('prompt', promptOptions);

    const result = await this.queue.processNext(async (queuedJob) => {
      return this.executePrompt(queuedJob.data as TedPromptOptions);
    });

    if (!result) {
      return {
        success: false,
        error: 'No result from queue',
        retryable: false,
        jobId: job.id,
      };
    }

    return {
      success: result.success,
      response: result.result as string | undefined,
      error: result.error,
      retryable: result.retryable,
      jobId: job.id,
    };
  }

  private async executePrompt(options: TedPromptOptions): Promise<string> {
    if (!this.managedProcess) {
      throw new Error('Pi RPC process not running');
    }

    const client = createJsonlClient(this.managedProcess.process, {
      timeoutMs: this.timeoutMs,
    });

    const prompt = buildTedPrompt(options);
    return await client.sendPrompt(prompt);
  }

  /**
   * Check if runner is running
   */
  isRunning(): boolean {
    return this.managedProcess !== null && !this.managedProcess.stopped;
  }

  /**
   * Get queue depth
   */
  getQueueDepth(): number {
    return this.queue.depth();
  }
}

/**
 * Create a new Pi RPC Runner instance
 */
export function createPiRpcRunner(options?: PiRpcRunnerOptions): PiRpcRunner {
  return new PiRpcRunner(options);
}