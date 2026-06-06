// ─────────────────────────────────────────────────────────────────────────────
// Pi Client Factory — chooses how to talk to Pi
// Modes: 'pi-native' (RpcClient) or 'disabled' (FakePiClient for dev/test)
// ─────────────────────────────────────────────────────────────────────────────

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'module';
import { RpcClient } from '@earendil-works/pi-coding-agent';
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

export function getPiTimeoutMs(): number {
  return parseInt(
    process.env.PI_RPC_TIMEOUT_MS ?? process.env.PI_TIMEOUT_MS ?? '90000',
    10,
  );
}

export function getPiRpcProvider(): string {
  return process.env.PI_RPC_PROVIDER ?? 'minimax';
}

export function getPiRpcModel(): string {
  return process.env.PI_RPC_MODEL ?? 'MiniMax-M2.7:off';
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
// RpcClient adapter (real Pi via upstream client)
// ─────────────────────────────────────────────────────────────────────────────

interface SendResult {
  success: boolean;
  reason?: string;
  data?: { message?: string };
}

function extractTextFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      return b.text;
    }
    if (!b.type && typeof b.text === 'string' && b.text.trim()) {
      return b.text;
    }
  }
  return null;
}

function resolvePiAgentCli(): string {
  // Prefer global npm install (version 0.78.1+) over pnpm workspace version (0.78.0)
  const globalCli = '/usr/local/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js';
  if (existsSync(globalCli)) return globalCli;

  // Fallback: resolve from package resolution
  const __filename = fileURLToPath(import.meta.url);
  let dir = dirname(__filename);
  for (let i = 0; i < 10; i++) {
    try {
      return realpathSync(resolve(dir, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js'));
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const req = createRequire(__filename);
  try {
    return req.resolve('@earendil-works/pi-coding-agent/dist/cli.js');
  } catch {
    return resolve(__dirname, '../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
  }
}

interface WarmablePiClient extends PiClient {
  warmup(): Promise<void>;
}

class PiBridgeAdapter implements WarmablePiClient {
  private client: RpcClient;
  private startPromise: Promise<void> | null = null;
  private started = false;
  private readonly projectRoot: string;

  constructor(_householdId: string) {
    this.projectRoot = PiBridgeAdapter.resolveProjectRoot();
    this.client = new RpcClient({
      cwd: this.projectRoot,
      cliPath: resolvePiAgentCli(),
      args: ['--no-session'],
      provider: getPiRpcProvider(),
      model: getPiRpcModel(),
    });
  }

  private static resolveProjectRoot(): string {
    const __filename = fileURLToPath(import.meta.url);
    let dir = dirname(__filename);
    for (let i = 0; i < 20; i++) {
      try {
        if (existsSync(resolve(dir, '.pi', 'AGENTS.md'))) return dir;
      } catch {}
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return resolve(dirname(__filename), '../../..');
  }

  async warmup(): Promise<void> {
    if (this.started) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.client.start()
      .then(() => { this.started = true; this.startPromise = null; })
      .catch(err => { this.startPromise = null; throw err; });

    return this.startPromise;
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;
    await this.warmup();
  }

  async send(
    message: string,
    _senderPhone: string,
    _context: { source: string; chatId: string; providerMessageId: string; idempotencyKey?: string },
  ): Promise<SendResult> {
    console.log('[PiBridge] send() timeoutMs:', getPiTimeoutMs(), '| projectRoot:', this.projectRoot);
    try {
      await this.ensureStarted();

      const timeoutMs = getPiTimeoutMs();
      console.log('[PiBridge] calling client.promptAndWait() with timeout', timeoutMs, 'ms');
      const events = await this.client.promptAndWait(message, undefined, timeoutMs);
      console.log('[PiBridge] promptAndWait returned', events.length, 'events');

      let extractedText: string | null = null;
      for (const event of events) {
        if (
          event.type === 'message_end' &&
          typeof event.message === 'object' &&
          event.message !== null
        ) {
          const msg = event.message as unknown as Record<string, unknown>;
          const content = msg.content as unknown;
          const text = extractTextFromContent(content);
          if (text !== null) extractedText = text;
        }
      }

      if (extractedText !== null) {
        return { success: true, data: { message: extractedText } };
      }

      const lastText = await this.client.getLastAssistantText();
      if (lastText !== null && lastText.trim()) {
        return { success: true, data: { message: lastText } };
      }

      console.error('[PiBridge] No text extracted from events. Stderr:', this.client.getStderr());
      return { success: false, reason: 'Pi agent did not produce a text response' };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'erro desconhecido';
      console.error('[PiBridge] Exception:', errorMessage, '| Stderr:', this.client.getStderr());
      return { success: false, reason: errorMessage };
    }
  }

  async stop(): Promise<void> {
    if (this.started) {
      await this.client.stop();
      this.started = false;
    }
  }
}

export function createAndWarmPiClient(householdId: string): Promise<WarmablePiClient> {
  const client = new PiBridgeAdapter(householdId);
  client.warmup().catch(err => console.error('[PiBridge] warmup failed:', err.message));
  return Promise.resolve(client);
}

export function createPiClient(householdId: string): PiClient {
  if (getAgentRuntime() === 'disabled') return new FakePiClient();
  return new PiBridgeAdapter(householdId);
}