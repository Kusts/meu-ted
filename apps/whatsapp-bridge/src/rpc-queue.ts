// ─────────────────────────────────────────────────────────────────────────────
// RPC Queue - Standalone implementation for WhatsApp Bridge
// ─────────────────────────────────────────────────────────────────────────────

export interface RpcJob {
  id: string;
  type: 'prompt';
  message: string;
  context?: Record<string, unknown>;
}

export interface RpcResponse {
  type: 'response' | 'event' | 'error';
  message?: string;
  event?: string;
  data?: Record<string, unknown>;
  done?: boolean;
}

export interface QueueOptions {
  timeoutMs?: number;
}

/**
 * RPC Queue with serialization and timeout
 * Ensures only one job runs at a time
 */
export class RpcQueue {
  private currentJob: string | null = null;
  private timeoutMs: number;

  constructor(options: QueueOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30000;
  }

  async enqueue<T>(jobId: string, executor: () => Promise<T>): Promise<T> {
    await this.acquireLock(jobId);
    
    try {
      return await this.withTimeout(executor, this.timeoutMs);
    } finally {
      this.releaseLock(jobId);
    }
  }

  private async acquireLock(jobId: string): Promise<void> {
    while (this.currentJob !== null) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    this.currentJob = jobId;
  }

  private releaseLock(jobId: string): void {
    if (this.currentJob === jobId) {
      this.currentJob = null;
    }
  }

  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout>;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    });

    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timeoutHandle!);
      return result as T;
    } catch (error) {
      clearTimeout(timeoutHandle!);
      if (error instanceof Error && error.message === 'timeout') {
        throw error;
      }
      throw error;
    }
  }

  isBusy(): boolean {
    return this.currentJob !== null;
  }

  getCurrentJob(): string | null {
    return this.currentJob;
  }
}

/**
 * Parse JSONL stream into responses
 */
export function parseJsonlResponse(output: string): { events: RpcResponse[]; finalMessage?: string } {
  const lines = output.split('\n').filter(line => line.trim());
  const events: RpcResponse[] = [];
  let finalMessage: string | undefined;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RpcResponse;
      events.push(parsed);
      
      if (parsed.type === 'response' && parsed.done) {
        finalMessage = parsed.message;
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return { events, finalMessage };
}

/**
 * Format prompt as JSONL
 */
export function formatPromptAsJsonl(message: string, context?: Record<string, unknown>): string {
  const prompt = {
    type: 'prompt',
    message,
    context: context ?? {},
  };
  return JSON.stringify(prompt);
}