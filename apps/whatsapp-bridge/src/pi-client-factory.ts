// ─────────────────────────────────────────────────────────────────────────────
// Pi Client Factory - Creates PiClient based on FINANCE_AGENT_RUNTIME
// Supports: disabled (dev/fake), pi-native (PiBridge)
// Step 6 refactor: removed legacy mode, removed PiRpcRunnerClient dependency
// ─────────────────────────────────────────────────────────────────────────────

import { PiBridge, type PiBridgeOptions } from './pi-bridge.js';
import type { PiClient } from './webhook-handler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment-based configuration
// ─────────────────────────────────────────────────────────────────────────────

export type AgentRuntime = 'pi-native' | 'disabled';

export function getAgentRuntime(): AgentRuntime {
  const env = process.env.FINANCE_AGENT_RUNTIME;
  if (env === 'disabled' || env === 'fake') return 'disabled';
  return 'pi-native'; // default (was 'legacy' before refactor)
}

export function getPiRpcEnabled(): boolean {
  return process.env.PI_RPC_ENABLED === 'true';
}

export function getPiCommand(): string {
  return process.env.PI_RPC_COMMAND || 'pi';
}

export function getPiArgs(): string[] {
  if (process.env.PI_RPC_ARGS) {
    try {
      return JSON.parse(process.env.PI_RPC_ARGS);
    } catch {
      return ['--mode', 'rpc'];
    }
  }
  return ['--mode', 'rpc'];
}

export function getPiTimeoutMs(): number {
  return parseInt(process.env.PI_RPC_TIMEOUT_MS || '120000', 10);
}

export function getWriteMode(): 'live' | 'shadow' {
  const env = process.env.FINANCE_WRITE_MODE;
  if (env === 'shadow') return 'shadow';
  return 'live';
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake Pi Client (disabled/dev mode - no Pi installed)
// ─────────────────────────────────────────────────────────────────────────────

class FakePiClient implements PiClient {
  private started = false;

  async start(): Promise<void> {
    this.started = true;
    console.log('[PiClient] Fake (disabled) mode - no Pi RPC');
  }

  async send(
    message: string,
    _senderPhone: string,
    context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    console.log(`[PiClient] Fake send (household=${context.householdId}): ${message.slice(0, 80)}...`);
    return {
      success: true,
      data: {
        message: '[dev] TED está desabilitado (FINANCE_AGENT_RUNTIME=disabled). Instale o Pi ou configure pi-native.',
      },
    };
  }

  isHealthy(): boolean {
    return this.started;
  }

  async stop(): Promise<void> {
    this.started = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PiBridge Adapter (implements PiClient)
// ─────────────────────────────────────────────────────────────────────────────

class PiBridgeAdapter implements PiClient {
  private bridge: PiBridge | null = null;

  constructor(private householdId: string) {
    // All communication goes through PiBridge via pi --mode rpc
  }

  async start(): Promise<void> {
    if (this.bridge) return;

    const bridgeOptions: PiBridgeOptions = {
      householdId: this.householdId,
      piCommand: getPiCommand(),
      piArgs: getPiArgs(),
      timeoutMs: getPiTimeoutMs(),
      projectDir: process.cwd(),
    };

    this.bridge = new PiBridge(bridgeOptions);
    await this.bridge.start();
  }

  async send(
    message: string,
    _senderPhone: string,
    context: { householdId: string; source: string; idempotencyKey?: string }
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    if (!this.bridge) {
      return { success: false, reason: 'PiBridge não iniciado' };
    }

    try {
      const response = await this.bridge.send(message, context.householdId);
      return { success: true, data: { message: response } };
    } catch (error) {
      return {
        success: false,
        reason: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  isHealthy(): boolean {
    return this.bridge?.isHealthy() ?? false;
  }

  async stop(): Promise<void> {
    if (this.bridge) {
      await this.bridge.stop();
      this.bridge = null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pi Client Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create the appropriate PiClient based on FINANCE_AGENT_RUNTIME
 * Default changed from 'legacy' to 'pi-native' (Step 6 refactor)
 * No more PiRpcRunnerClient, no more require() calls for deleted files
 */
export function createPiClient(householdId: string): PiClient {
  const runtime = getAgentRuntime();

  switch (runtime) {
    case 'disabled':
      // Dev/test mode: fake client logs but does not call Pi
      const fake = new FakePiClient();
      fake.start().catch(console.error);
      return fake;

    case 'pi-native':
    default:
      // PiBridge adapter with real pi --mode rpc
      const adapter = new PiBridgeAdapter(householdId);
      adapter.start().catch(console.error);
      return adapter;
  }
}