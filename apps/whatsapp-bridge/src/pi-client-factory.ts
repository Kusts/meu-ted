// ─────────────────────────────────────────────────────────────────────────────
// Pi Client Factory - Creates PiClient based on FINANCE_AGENT_RUNTIME
// Supports: legacy (PiRpcRunnerClient), pi-native (PiBridge)
// ─────────────────────────────────────────────────────────────────────────────

import { PiBridge, type PiBridgeOptions } from './pi-bridge.js';
import { FinanceApiClient, type AccountBalance, type MonthSummary } from './finance-api-client.js';
import type { PiClient } from './webhook-handler.js';

// ─────────────────────────────────────────────────────────────────────────────
// Report Finance API Client interface
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportFinanceApiClient {
  getCurrentMonthSummary(householdId: string): Promise<{ success: boolean; data?: MonthSummary; reason?: string }>;
  getAccountBalances(householdId: string): Promise<{ success: boolean; data?: AccountBalance[]; reason?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment-based configuration
// ─────────────────────────────────────────────────────────────────────────────

export type AgentRuntime = 'legacy' | 'pi-native';

export function getAgentRuntime(): AgentRuntime {
  const env = process.env.FINANCE_AGENT_RUNTIME;
  if (env === 'pi-native') return 'pi-native';
  return 'legacy'; // default
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
  return parseInt(process.env.PI_RPC_TIMEOUT_MS || '30000', 10);
}

export function getWriteMode(): 'live' | 'shadow' {
  const env = process.env.FINANCE_WRITE_MODE;
  if (env === 'shadow') return 'shadow';
  return 'live';
}

// ─────────────────────────────────────────────────────────────────────────────
// PiBridge Adapter (implements PiClient)
// ─────────────────────────────────────────────────────────────────────────────

export class PiBridgeAdapter implements PiClient {
  private bridge: PiBridge | null = null;
  private financeApiClient: ReportFinanceApiClient;

  constructor(private householdId: string, options?: { financeApiClient?: ReportFinanceApiClient }) {
    this.financeApiClient = options?.financeApiClient ?? new FinanceApiClient();
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

export interface PiClientFactoryOptions {
  householdId: string;
  financeApiClient?: ReportFinanceApiClient;
}

/**
 * Create the appropriate PiClient based on FINANCE_AGENT_RUNTIME
 */
export function createPiClient(options: PiClientFactoryOptions): PiClient {
  const runtime = getAgentRuntime();

  switch (runtime) {
    case 'pi-native':
      // Lazy import to avoid circular deps
      return createPiNativeClient(options);

    case 'legacy':
    default:
      return createLegacyPiClient(options);
  }
}

function createLegacyPiClient(options: PiClientFactoryOptions): PiClient {
  // Dynamic import to avoid circular dependency
  const { PiRpcRunnerClient } = require('./pi-rpc-runner-client.js');

  return new PiRpcRunnerClient({
    enabled: getPiRpcEnabled(),
    command: getPiCommand(),
    args: getPiArgs(),
    timeoutMs: getPiTimeoutMs(),
    cwd: process.cwd(),
    financeApiClient: options.financeApiClient,
  });
}

function createPiNativeClient(options: PiClientFactoryOptions): PiClient {
  const adapter = new PiBridgeAdapter(options.householdId, {
    financeApiClient: options.financeApiClient,
  });

  // Start bridge eagerly
  adapter.start().catch(console.error);

  return adapter;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export for compatibility
// ─────────────────────────────────────────────────────────────────────────────

export { PiRpcRunnerClient } from './pi-rpc-runner-client.js';
export type { PiRpcRunnerClientOptions } from './pi-rpc-runner-client.js';