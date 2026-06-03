// ─────────────────────────────────────────────────────────────────────────────
// Pi Client Factory — chooses how to talk to Pi
// Modes: 'pi-native' (real PiBridge) or 'disabled' (FakePiClient for dev/test)
// ─────────────────────────────────────────────────────────────────────────────

import { PiBridge, type PiBridgeOptions } from './pi-bridge.js';
import type { PiClient } from './webhook-handler.js';

export type AgentRuntime = 'pi-native' | 'disabled';

export function getAgentRuntime(): AgentRuntime {
  const env = process.env.PI_AGENT_RUNTIME ?? process.env.FINANCE_AGENT_RUNTIME;
  if (env === 'disabled' || env === 'fake') return 'disabled';
  return 'pi-native';
}

export function getWriteMode(): 'live' | 'shadow' {
  const env = process.env.PI_WRITE_MODE ?? process.env.FINANCE_WRITE_MODE;
  if (env === 'shadow') return 'shadow';
  return 'live';
}

function getPiCommand(): string {
  return process.env.PI_RPC_COMMAND ?? process.env.PI_COMMAND ?? 'pi';
}

function getPiArgs(): string[] {
  const raw = process.env.PI_RPC_ARGS ?? process.env.PI_ARGS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as string[];
    } catch {
      // fall through to default
    }
    // Allow comma-separated form: "--mode,rpc"
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return ['--mode', 'rpc'];
}

function getPiTimeoutMs(): number {
  return parseInt(
    process.env.PI_RPC_TIMEOUT_MS ?? process.env.PI_TIMEOUT_MS ?? '120000',
    10,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fake Pi Client (used when runtime is 'disabled')
// ─────────────────────────────────────────────────────────────────────────────

class FakePiClient implements PiClient {
  async send(): Promise<{ success: boolean; data?: { message?: string } }> {
    return {
      success: true,
      data: {
        message:
          '[dev] Agent Pi desabilitado (PI_AGENT_RUNTIME=disabled). Configure pi-native para usar o Pi.',
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PiBridge adapter (real pi --mode rpc)
// ─────────────────────────────────────────────────────────────────────────────

class PiBridgeAdapter implements PiClient {
  private bridge: PiBridge;

  constructor(householdId: string) {
    const opts: PiBridgeOptions = {
      householdId,
      piCommand: getPiCommand(),
      piArgs: getPiArgs(),
      timeoutMs: getPiTimeoutMs(),
      projectDir: process.cwd(),
    };
    this.bridge = new PiBridge(opts);
    void this.bridge.start();
  }

  async send(
    message: string,
    _senderPhone: string,
    context: { source: string; chatId: string; providerMessageId: string; idempotencyKey?: string },
  ): Promise<{ success: boolean; reason?: string; data?: { message?: string } }> {
    try {
      const text = await this.bridge.send(message, context.chatId);
      return { success: true, data: { message: text } };
    } catch (err) {
      return {
        success: false,
        reason: err instanceof Error ? err.message : 'erro desconhecido',
      };
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public factory
// ─────────────────────────────────────────────────────────────────────────────

export function createPiClient(householdId: string): PiClient {
  if (getAgentRuntime() === 'disabled') {
    return new FakePiClient();
  }
  return new PiBridgeAdapter(householdId);
}
