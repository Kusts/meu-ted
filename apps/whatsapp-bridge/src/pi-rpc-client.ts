// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Client for WhatsApp Bridge
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'child_process';
import { RpcQueue, formatPromptAsJsonl, parseJsonlResponse } from './rpc-queue.js';
import type { PiClient } from './webhook-handler.js';

export interface PiRpcClientOptions {
  processCommand: string; // e.g., 'pi', 'npx', etc.
  args?: string[];
  timeoutMs?: number;
}

/**
 * Pi RPC Client - sends messages to Pi agent via JSONL stdin/stdout
 */
export class PiRpcClient implements PiClient {
  private queue: RpcQueue;
  private timeoutMs: number;

  constructor(private options: PiRpcClientOptions) {
    this.queue = new RpcQueue({ timeoutMs: options.timeoutMs ?? 60000 });
    this.timeoutMs = options.timeoutMs ?? 60000;
  }

  async send(
    message: string,
    _senderPhone: string,
    context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    // Enqueue to serialize with other WhatsApp messages
    return this.queue.enqueue(
      context.idempotencyKey ?? `msg-${Date.now()}`,
      async () => this.executePrompt(message, context)
    );
  }

  private async executePrompt(
    message: string,
    context: { householdId: string; source: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    // Build prompt with TED context
    const prompt = this.buildPrompt(message, context);
    const jsonl = formatPromptAsJsonl(prompt, context);

    try {
      // Execute Pi process
      const output = await this.executePiProcess(jsonl);
      
      // Parse JSONL response
      const { finalMessage } = parseJsonlResponse(output);

      if (finalMessage) {
        return { success: true, data: { message: finalMessage } };
      }

      return { success: false, reason: 'Pi não retornou resposta' };
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout') {
        return { success: false, reason: 'timeout - tente novamente' };
      }
      return {
        success: false,
        reason: error instanceof Error ? error.message : 'erro desconhecido',
      };
    }
  }

  private buildPrompt(
    message: string,
    context: { householdId: string; source: string }
  ): string {
    const tedPrefix = `[WhatsApp | ${context.source}] Mensagem de ${context.householdId}:`;
    return `${tedPrefix} ${message}`;
  }

  private async executePiProcess(jsonlInput: string): Promise<string> {
    const args = this.options.args ?? ['--mode', 'rpc'];
    
    return new Promise((resolve, reject) => {
      const proc = spawn(this.options.processCommand, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set timeout
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error('timeout'));
      }, this.timeoutMs);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(stderr || `Pi process exited with ${code}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      // Write JSONL to stdin
      proc.stdin?.write(jsonlInput);
      proc.stdin?.end();
    });
  }
}

/**
 * Fake Pi client for testing
 */
export class FakePiClient implements PiClient {
  public responses: Array<{
    success: boolean;
    reason?: string;
    data?: { message?: string };
  }> = [];
  public callLog: Array<{ message: string; context: Record<string, unknown> }> = [];
  private responseIndex = 0;
  private shouldTimeout = false;

  constructor(defaultResponse?: { success: boolean; reason?: string; data?: { message?: string } }) {
    if (defaultResponse) {
      this.responses.push(defaultResponse);
    }
  }

  async send(
    message: string,
    _senderPhone: string,
    context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    this.callLog.push({ message, context });

    if (this.shouldTimeout) {
      this.shouldTimeout = false;
      throw new Error('timeout');
    }

    if (this.responseIndex < this.responses.length) {
      return this.responses[this.responseIndex++];
    }

    return { success: true, data: { message: 'OK' } };
  }

  addResponse(response: { success: boolean; reason?: string; data?: { message?: string } }): void {
    this.responses.push(response);
  }

  setTimeout(): void {
    this.shouldTimeout = true;
  }

  reset(): void {
    this.callLog = [];
    this.responseIndex = 0;
    this.shouldTimeout = false;
  }
}