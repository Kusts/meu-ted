// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - JSONL Client
// Communicates with `pi --mode rpc` via stdin/stdout JSONL protocol
// ─────────────────────────────────────────────────────────────────────────────

import type { ChildProcess } from 'child_process';

export interface JsonlClientOptions {
  timeoutMs?: number;
  onTimeout?: () => void;
}

export interface JsonlResponse {
  type: string;
  delta?: string;
  message?: string;
  toolCalls?: unknown[];
  [key: string]: unknown;
}

export type ResponseHandler = (text: string) => void;
export type ErrorHandler = (message: string) => void;
export type ToolCallHandler = (calls: unknown[]) => void;

interface PendingResponse {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Creates a JSONL client for Pi RPC communication
 * 
 * Protocol:
 * - Out: {"type":"prompt","message":"..."}\n
 * - In:  {"type":"message_update","delta":"..."}
 * - In:  {"type":"error","message":"..."}
 * - In:  {"type":"tool_calls","calls":[...]}
 * - In:  {"type":"done"}
 */
export function createJsonlClient(
  process: ChildProcess,
  options: JsonlClientOptions = {}
): JsonlClient {
  return new JsonlClient(process, options);
}

class JsonlClient {
  private responseBuffer = '';
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingResponse: PendingResponse | null = null;
  private responseHandlers: ResponseHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private toolCallHandlers: ToolCallHandler[] = [];
  private isDone = false;

  constructor(
    private process: ChildProcess,
    private options: JsonlClientOptions = {}
  ) {
    this.setupStdoutListener();
  }

  private setupStdoutListener(): void {
    this.process.stdout?.on('data', (data: Buffer) => {
      this.handleData(data);
    });
  }

  private handleData(data: Buffer): void {
    const text = data.toString();
    const lines = text.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const parsed: JsonlResponse = JSON.parse(line);
        this.handleParsedMessage(parsed);
      } catch {
        // Accumulate partial JSON
        this.responseBuffer += text;
        this.tryParseBuffer();
      }
    }
  }

  private tryParseBuffer(): void {
    if (!this.responseBuffer.includes('\n')) return;

    const lines = this.responseBuffer.split('\n');
    this.responseBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed: JsonlResponse = JSON.parse(line);
          this.handleParsedMessage(parsed);
        } catch {
          // Keep in buffer
        }
      }
    }
  }

  private handleParsedMessage(msg: JsonlResponse): void {
    switch (msg.type) {
      case 'message_update':
        if (typeof msg.delta === 'string') {
          this.responseHandlers.forEach(h => h(msg.delta!));
        }
        this.resetTimeout();
        break;

      case 'tool_calls':
        if (Array.isArray(msg.toolCalls)) {
          this.toolCallHandlers.forEach(h => h(msg.toolCalls!));
        }
        break;

      case 'error':
        this.isDone = true;
        this.errorHandlers.forEach(h => h(msg.message || 'Unknown error'));
        this.clearTimeout();
        this.rejectPending(new Error(msg.message || 'Unknown error'));
        break;

      case 'done':
        this.isDone = true;
        this.clearTimeout();
        this.resolvePending();
        break;
    }
  }

  private resetTimeout(): void {
    if (this.timeoutId) clearTimeout(this.timeoutId);
    
    if (this.options.timeoutMs) {
      this.timeoutId = setTimeout(() => {
        this.handleTimeout();
      }, this.options.timeoutMs);
    }
  }

  private handleTimeout(): void {
    this.isDone = true;
    const error = new Error('Request timeout');
    this.errorHandlers.forEach(h => h('Request timeout'));
    this.rejectPending(error);
    
    if (this.options.onTimeout) {
      this.options.onTimeout();
    }
  }

  private clearTimeout(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private resolvePending(): void {
    if (this.pendingResponse) {
      this.pendingResponse.resolve(this.responseBuffer);
      this.pendingResponse = null;
    }
    this.responseBuffer = '';
  }

  private rejectPending(error: Error): void {
    if (this.pendingResponse) {
      this.pendingResponse.reject(error);
      this.pendingResponse = null;
    }
    this.responseBuffer = '';
  }

  /**
   * Send a prompt to Pi RPC
   */
  sendPrompt(message: string, metadata?: Record<string, unknown>): Promise<string> {
    if (this.isDone) {
      return Promise.reject(new Error('Client already done'));
    }

    const payload: Record<string, unknown> = {
      type: 'prompt',
      message,
    };

    if (metadata) {
      Object.assign(payload, metadata);
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingResponse = null;
        reject(new Error('Request timeout'));
      }, this.options.timeoutMs || 30000);

      this.pendingResponse = { resolve, reject, timeoutId };

      this.process.stdin?.write(JSON.stringify(payload) + '\n');
      this.resetTimeout();
    });
  }

  /**
   * Register handler for response text deltas
   */
  onResponse(handler: ResponseHandler): void {
    this.responseHandlers.push(handler);
  }

  /**
   * Register handler for errors
   */
  onError(handler: ErrorHandler): void {
    this.errorHandlers.push(handler);
  }

  /**
   * Register handler for tool calls
   */
  onToolCalls(handler: ToolCallHandler): void {
    this.toolCallHandlers.push(handler);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.clearTimeout();
    this.responseHandlers = [];
    this.errorHandlers = [];
    this.toolCallHandlers = [];
    this.process.stdout?.removeAllListeners('data');
  }
}