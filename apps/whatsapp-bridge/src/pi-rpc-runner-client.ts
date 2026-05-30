// ─────────────────────────────────────────────────────────────────────────────
// PiRpcRunner Adapter for WhatsApp Bridge
// Wraps PiRpcRunner to implement PiClient interface
// ─────────────────────────────────────────────────────────────────────────────

import type { PiClient } from './webhook-handler.js';
import { createPiRpcRunner } from '@pi-financeiro/pi-rpc-runner';

export interface PiRpcRunnerClientOptions {
  enabled?: boolean;
  command?: string;
  args?: string[];
  timeoutMs?: number;
  cwd?: string;
}

/**
 * Adapter that wraps PiRpcRunner to implement PiClient interface
 */
export class PiRpcRunnerClient implements PiClient {
  private runner: ReturnType<typeof createPiRpcRunner> | null = null;
  private enabled: boolean;

  constructor(options: PiRpcRunnerClientOptions = {}) {
    this.enabled = options.enabled ?? false;
    
    if (this.enabled) {
      this.runner = createPiRpcRunner({
        piCommand: options.command ?? 'pi',
        piArgs: options.args ?? ['--mode', 'rpc'],
        cwd: options.cwd,
        timeoutMs: options.timeoutMs ?? 30000,
      });
      this.runner.start();
    }
  }

  async send(
    message: string,
    _senderPhone: string,
    context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    if (!this.enabled || !this.runner) {
      return { success: false, reason: 'Pi RPC não habilitado' };
    }

    try {
      const result = await this.runner.runPrompt({
        userMessage: message,
        householdId: context.householdId,
        source: context.source as 'whatsapp' | 'dashboard' | 'cron' | 'agent',
        idempotencyKey: context.idempotencyKey,
      });

      if (result.success) {
        return {
          success: true,
          data: { message: result.response ?? 'OK' },
        };
      }

      return {
        success: false,
        reason: result.error ?? 'Erro desconhecido',
      };
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  stop(): void {
    if (this.runner) {
      this.runner.stop();
      this.runner = null;
    }
  }
}

/**
 * Factory to create PiClient based on environment
 */
export function createPiClient(options?: PiRpcRunnerClientOptions): PiClient {
  const enabled = options?.enabled ?? isPiRpcEnabled();
  
  if (!enabled) {
    return new FakePiClientWrapper();
  }

  return new PiRpcRunnerClient(options);
}

/**
 * Check if Pi RPC is enabled via environment
 */
function isPiRpcEnabled(): boolean {
  return process.env.PI_RPC_ENABLED === 'true';
}

/**
 * Get Pi command from environment or use default
 */
export function getPiCommand(): string {
  return process.env.PI_RPC_COMMAND || 'pi';
}

/**
 * Get Pi args from environment or use default
 */
export function getPiArgs(): string[] {
  if (process.env.PI_RPC_ARGS) {
    return JSON.parse(process.env.PI_RPC_ARGS);
  }
  return ['--mode', 'rpc'];
}

/**
 * Get timeout from environment or use default
 */
export function getPiTimeoutMs(): number {
  return parseInt(process.env.PI_RPC_TIMEOUT_MS || '30000', 10);
}

/**
 * Fake Pi client wrapper that does nothing
 */
class FakePiClientWrapper implements PiClient {
  async send(
    _message: string,
    _senderPhone: string,
    _context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    return { success: false, reason: 'Pi RPC desabilitado em modo desenvolvimento' };
  }
}