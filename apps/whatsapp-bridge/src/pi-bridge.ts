// ─────────────────────────────────────────────────────────────────────────────
// PiBridge - Robust stdin/stdout adapter for Pi RPC mode
// Serializes requests globally (one at a time) + per-chat queue fallback
// Handles real Pi RPC events (turn_end/agent_end/message_update) that arrive
// WITHOUT request ID — matches via currentRequestId tracker
// ─────────────────────────────────────────────────────────────────────────────

import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PiBridgeOptions {
  piCommand?: string;           // default: 'pi'
  piArgs?: string[];            // default: ['--mode', 'rpc']
  systemPromptPath?: string;    // path to AGENTS.md
  timeoutMs?: number;           // default: 120000
  projectDir?: string;          // for locating .pi/AGENTS.md
  householdId: string;
}

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  startedAt: number;
  requestId: string;
  message: string;
  chatId: string;
}

interface JsonRpcMessage {
  id?: string;
  type?: string;
  message?: string | { role: string; content: Array<{ type: string; text: string }> };
  delta?: string;
  text_delta?: string;
  text?: string;
  error?: string;
  status?: string;
  // Real Pi RPC protocol fields
  command?: string;
  success?: boolean;
  assistantMessageEvent?: {
    type?: string;
    delta?: string;
    content?: string;
  };
}

type BridgeEventType = 'message_update' | 'turn_end' | 'agent_end' | 'error' | 'health_check';
type BridgeEventHandler = (data: JsonRpcMessage) => void;

// ─────────────────────────────────────────────────────────────────────────────
// PiBridge Class
// ─────────────────────────────────────────────────────────────────────────────

export class PiBridge {
  private proc: ChildProcess | null = null;
  private options: Required<PiBridgeOptions>;
  private isRunning = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  // JSONL buffer - accumulates incomplete lines
  private lineBuffer = '';

  // Per-chat queues for serialization
  private chatQueues = new Map<string, PendingRequest[]>();

  // Active request tracking (requestId → PendingRequest)
  private activeRequests = new Map<string, PendingRequest>();

  // Current request being processed (set when prompt is sent)
  private currentRequestId: string | null = null;

  // Streaming text accumulator per request
  private accumulatedText = new Map<string, string>();

  // Event handlers
  private eventHandlers = new Map<BridgeEventType, Set<BridgeEventHandler>>();

  // Startup promise for concurrency control
  private startPromise: Promise<void> | null = null;

  constructor(opts: PiBridgeOptions) {
    this.options = {
      piCommand: opts.piCommand ?? 'pi',
      piArgs: opts.piArgs ?? ['--mode', 'rpc'],
      systemPromptPath: opts.systemPromptPath ?? '',
      timeoutMs: opts.timeoutMs ?? 120000,
      projectDir: opts.projectDir ?? process.cwd(),
      householdId: opts.householdId,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.isRunning) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart();
    return this.startPromise;
  }

  private async doStart(): Promise<void> {
    const args = [...this.options.piArgs];
    this.proc = spawn(this.options.piCommand, args, {
      cwd: this.options.projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      shell: true,
    });

    this.proc.stdout?.on('data', (chunk: Buffer) => {
      this.handleStdout(chunk.toString());
    });
    this.proc.stderr?.on('data', (chunk: Buffer) => {
      this.handleStderr(chunk.toString());
    });
    this.proc.on('exit', (code, signal) => {
      this.isRunning = false;
      this.clearHealthCheck();
      this.rejectAllPending(new Error(`Pi process exited: ${code ?? 'unknown'} (${signal ?? 'no signal'})`));
      setTimeout(() => {
        if (this.isRunning) return;
        console.log('[PiBridge] Process died, restarting...');
        this.doStart().catch(console.error);
      }, 1000);
    });
    this.proc.on('error', (err) => {
      console.error('[PiBridge] Process error:', err);
      this.emit('error', { error: err.message });
    });

    await this.waitForReady();
    this.startHealthCheck();
    this.isRunning = true;
    console.log('[PiBridge] Started successfully');
  }

  /**
   * Send a message and wait for response
   * Serialized globally — only one request active at a time per Pi process
   */
  async send(message: string, chatId: string): Promise<string> {
    if (!this.isRunning || !this.proc?.stdin) {
      throw new Error('PiBridge not running');
    }

    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      const timeout = setTimeout(() => {
        this.handleRequestTimeout(requestId);
        reject(new Error(`Request timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);

      const pending: PendingRequest = {
        resolve,
        reject,
        timeout,
        startedAt: Date.now(),
        requestId,
        message,
        chatId,
      };

      const queue = this.chatQueues.get(chatId) ?? [];
      queue.push(pending);
      this.chatQueues.set(chatId, queue);
      this.activeRequests.set(requestId, pending);

      // Only send if no current request is active
      if (this.currentRequestId === null) {
        this.sendImmediate(requestId, message, chatId);
      }
    });
  }

  private sendImmediate(requestId: string, message: string, _chatId: string): void {
    if (!this.proc?.stdin) return;
    this.currentRequestId = requestId;

    const payload = {
      id: requestId,
      type: 'prompt',
      message,
      householdId: this.options.householdId,
    };
    this.proc.stdin.write(JSON.stringify(payload) + '\n');
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    this.clearHealthCheck();
    this.rejectAllPending(new Error('PiBridge stopped'));

    if (this.proc) {
      this.proc.stdin?.write('{"type":"stop"}\n');
      await new Promise(resolve => setTimeout(resolve, 100));
      this.proc.kill();
      this.proc = null;
    }

    this.chatQueues.clear();
    this.activeRequests.clear();
    this.accumulatedText.clear();
    this.currentRequestId = null;
    this.lineBuffer = '';
    console.log('[PiBridge] Stopped');
  }

  isHealthy(): boolean {
    return this.isRunning && this.proc != null && this.proc.exitCode === null;
  }

  on(event: BridgeEventType, handler: BridgeEventHandler): void {
    const handlers = this.eventHandlers.get(event) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event, handlers);
  }

  off(event: BridgeEventType, handler: BridgeEventHandler): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) handlers.delete(handler);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────────────

  private async waitForReady(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 500));
  }

  private handleStdout(data: string): void {
    this.lineBuffer += data;
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg: JsonRpcMessage = JSON.parse(line);
        this.handleMessage(msg);
      } catch {
        // Ignore parse errors
      }
    }
  }

  private handleStderr(data: string): void {
    console.warn('[PiBridge stderr]', data.trim());
  }

  /**
   * Extract text from any Pi RPC message format.
   */
  private extractTextFromPiMessage(msg: unknown): string {
    if (!msg || typeof msg !== 'object') return '';
    const m = msg as Record<string, unknown>;

    const message = m.message as { content?: Array<{ type: string; text: string }> } | undefined;
    if (message?.content?.[0]?.text) return message.content[0].text;

    const evt = m.assistantMessageEvent as { type?: string; delta?: string; content?: string } | undefined;
    if (evt?.type === 'text_delta' && typeof evt.delta === 'string') return evt.delta;
    if (evt?.type === 'text_end' && typeof evt.content === 'string') return evt.content;

    if (typeof m.text === 'string') return m.text;
    if (typeof m.delta === 'string') return m.delta;
    if (typeof m.text_delta === 'string') return m.text_delta;

    return '';
  }

  /**
   * Resolve the current pending request.
   * Used by both id-matched and id-free event paths.
   */
  private resolveCurrentRequest(finalText: string, msg: JsonRpcMessage, requestId: string): void {
    const pending = this.activeRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.activeRequests.delete(requestId);
    this.accumulatedText.delete(requestId);
    this.currentRequestId = null;
    pending.resolve(finalText);
    this.emit('turn_end', msg);
    this.emit('agent_end', msg);
    this.dequeueNext(requestId, pending.chatId);
  }

  /**
   * Reject the current pending request.
   */
  private rejectCurrentRequest(error: Error, msg: JsonRpcMessage, requestId: string): void {
    const pending = this.activeRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.activeRequests.delete(requestId);
    this.accumulatedText.delete(requestId);
    this.currentRequestId = null;
    pending.reject(error);
    this.emit('error', msg);
    this.dequeueNext(requestId, pending.chatId);
  }

  /**
   * Handle parsed JSON message from Pi RPC.
   *
   * Real protocol events that arrive WITHOUT `id`:
   * - message_update (streaming deltas)
   * - turn_end (final answer with full message.content[0].text)
   * - agent_end (end of agent, may or may not have id)
   *
   * Only `response` (ACK) has `id` but does NOT resolve the request.
   *
   * Strategy: match via currentRequestId (set when prompt was sent).
   * Pi RPC processes one request at a time per session — this is safe.
   */
  private handleMessage(msg: JsonRpcMessage): void {
    const { id, type } = msg;

    // 'response' is just an ACK — do NOT resolve
    if (type === 'response') {
      return;
    }

    // ── Case A: Event has matching id ──────────────────────────────────────
    if (id && this.activeRequests.has(id)) {
      this.handleTrackedEvent(msg, id);
      return;
    }

    // ── Case B: Event has no id — use currentRequestId ───────────────
    if (this.currentRequestId && this.activeRequests.has(this.currentRequestId)) {
      this.handleTrackedEvent(msg, this.currentRequestId);
      return;
    }

    // ── Case C: No matching request — emit typed events only ─────────
    switch (type) {
      case 'message_update':
      case 'turn_end':
      case 'agent_end':
      case 'error':
        this.emit(type, msg);
        break;
    }
  }

  /**
   * Process an event that belongs to a known requestId.
   * Handles: message_update (stream), turn_end (final), agent_end (fallback), error.
   */
  private handleTrackedEvent(msg: JsonRpcMessage, requestId: string): void {
    const { type, error } = msg;

    // Stream chunks: accumulate text_delta
    if (type === 'message_update') {
      const chunk = this.extractTextFromPiMessage(msg);
      if (chunk) {
        const prev = this.accumulatedText.get(requestId) ?? '';
        this.accumulatedText.set(requestId, prev + chunk);
      }
      this.emit('message_update', msg);
      return;
    }

    // turn_end: final answer
    if (type === 'turn_end') {
      // Already resolved? Don't double-resolve
      if (!this.activeRequests.has(requestId)) return;

      const finalText = this.extractTextFromPiMessage(msg)
        || this.accumulatedText.get(requestId)
        || '';
      this.resolveCurrentRequest(finalText, msg, requestId);
      return;
    }

    // agent_end: fallback resolver (only if not already resolved by turn_end)
    if (type === 'agent_end') {
      if (!this.activeRequests.has(requestId)) return;

      const finalText = this.extractTextFromPiMessage(msg)
        || this.accumulatedText.get(requestId)
        || '';
      this.resolveCurrentRequest(finalText, msg, requestId);
      return;
    }

    // Errors
    if (type === 'error' || error) {
      if (!this.activeRequests.has(requestId)) return;
      this.rejectCurrentRequest(
        new Error(typeof error === 'string' ? error : 'Pi RPC error'),
        msg,
        requestId
      );
    }
  }

  /**
   * Dequeue next message for a chat after completing/removing the current one.
   * After the chat-specific queue is updated, also sweeps remaining chats
   * to pick up any waiting requests (global serialization).
   */
  private dequeueNext(_completedId: string, chatId: string): void {
    // Remove completed from its chat queue
    const queue = this.chatQueues.get(chatId);
    if (queue && queue.length > 0) {
      queue.shift();
      if (queue.length === 0) {
        this.chatQueues.delete(chatId);
      }
    }

    // After the chat-specific queue is updated, try to pick up the next request
    // If no more in this chat, look at other chats (global serialization)
    if (this.chatQueues.size === 0) {
      this.currentRequestId = null;
      return;
    }

    // Find the next chat that has a pending request
    for (const [nextChatId, nextQueue] of this.chatQueues) {
      if (nextQueue.length > 0) {
        const next = nextQueue[0];
        this.sendImmediate(next.requestId, next.message, nextChatId);
        return;
      }
    }
  }

  /**
   * Handle request timeout.
   */
  private handleRequestTimeout(requestId: string): void {
    const pending = this.activeRequests.get(requestId);
    if (!pending) return;

    const chatId = pending.chatId;
    this.activeRequests.delete(requestId);
    this.accumulatedText.delete(requestId);

    // Clear currentRequestId if this was the active request
    if (this.currentRequestId === requestId) {
      this.currentRequestId = null;
    }

    // Dequeue next (reject already fired via timeout)
    this.dequeueNext(requestId, chatId);
  }

  /**
   * Reject all pending requests (on stop or exit).
   */
  private rejectAllPending(err: Error): void {
    for (const pending of this.activeRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(err);
    }
    this.activeRequests.clear();
    this.accumulatedText.clear();
    this.currentRequestId = null;

    for (const queue of this.chatQueues.values()) {
      for (const pending of queue) {
        clearTimeout(pending.timeout);
        pending.reject(err);
      }
    }
    this.chatQueues.clear();
  }

  private emit(type: BridgeEventType, data: JsonRpcMessage): void {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (e) {
          console.error('[PiBridge] Event handler error:', e);
        }
      }
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      if (!this.isHealthy()) {
        console.warn('[PiBridge] Health check failed');
        this.emit('health_check', { status: 'unhealthy' });
      } else {
        this.emit('health_check', { status: 'healthy' });
      }
    }, 5000);
  }

  private clearHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPiBridge(opts: PiBridgeOptions): PiBridge {
  return new PiBridge(opts);
}