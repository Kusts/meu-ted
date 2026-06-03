// ─────────────────────────────────────────────────────────────────────────────
// Pi Client Factory — chooses how to talk to Pi
// Modes: 'pi-native' (RpcClient) or 'disabled' (FakePiClient for dev/test)
// ─────────────────────────────────────────────────────────────────────────────

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { realpathSync } from 'node:fs';
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

function getPiTimeoutMs(): number {
  return parseInt(
    process.env.PI_RPC_TIMEOUT_MS ?? process.env.PI_TIMEOUT_MS ?? '90000',
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
// RpcClient adapter (real Pi via upstream client)
// Runtime is dedicated and isolated — uses --no-session for no session
// pollution with the user's interactive sessions.
//
// Uses collectEvents() + manual text extraction from message_end events.
// getLastAssistantText() returns null when agent is mid-tool or has no
// assistant message yet; collectEvents gives us the actual text directly.
// ─────────────────────────────────────────────────────────────────────────────

interface SendResult {
  success: boolean;
  reason?: string;
  data?: { message?: string };
}

/**
 * Extract text from a message content array.
 * Prioritizes text blocks, skips thinking blocks.
 */
function extractTextFromContent(content: unknown): string | null {
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
      return b.text;
    }
    // Plain { text: '...' } without type field
    if (!b.type && typeof b.text === 'string' && b.text.trim()) {
      return b.text;
    }
  }
  return null;
}

/**
 * Resolve the installed pi-coding-agent CLI from node_modules.
 *
 * Uses createRequire(import.meta.url) — the only robust approach in ESM
 * that correctly follows pnpm symlinks in a monorepo workspace.
 *
 * require.resolve('@earendil-works/pi-coding-agent/dist/cli.js') may fail
 * because the package has no "exports" main, so we walk up directories
 * from this source file until we find node_modules/@earendil-works/pi-coding-agent,
 * then append dist/cli.js. realpathSync resolves the symlink to the
 * actual pnpm store location.
 */
function resolvePiAgentCli(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const req = createRequire(__filename);

  // Walk up from this source file's directory (src/) to workspace root.
  // Each iteration: try node_modules/@earendil-works/pi-coding-agent/dist/cli.js
  // at the current level. realpathSync resolves any pnpm symlink to the
  // actual pnpm store path, avoiding "Cannot find module" errors.
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    try {
      const candidate = resolve(dir, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
      return realpathSync(candidate);
    } catch {
      // Not found at this level, walk up one directory
    }
    const parent = dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // Fallback: try createRequire resolution directly (may throw)
  try {
    return req.resolve('@earendil-works/pi-coding-agent/dist/cli.js');
  } catch {
    // Last resort: relative path from src/ — let it throw clearly if wrong
    return resolve(__dirname, '../../node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
  }
}

class PiBridgeAdapter implements PiClient {
  private client: RpcClient;
  private started = false;

  constructor(_householdId: string) {
    this.client = new RpcClient({
      cwd: process.cwd(),
      cliPath: resolvePiAgentCli(),
      args: ['--no-session'],
    });
  }

  async send(
    message: string,
    _senderPhone: string,
    _context: { source: string; chatId: string; providerMessageId: string; idempotencyKey?: string },
  ): Promise<SendResult> {
    try {
      if (!this.started) {
        await this.client.start();
        this.started = true;
      }

      const timeoutMs = getPiTimeoutMs();

      // Collect all events until agent_end — this gives us the full run.
      // We extract text from message_end events directly instead of relying
      // on getLastAssistantText() which returns null when agent is mid-tool.
      const events = await this.client.promptAndWait(message, undefined, timeoutMs);

      // Try to extract text from the last message_end that has content
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

      // Fallback: try getLastAssistantText
      const lastText = await this.client.getLastAssistantText();
      if (lastText !== null && lastText.trim()) {
        return { success: true, data: { message: lastText } };
      }

      // No text found — log for debugging, return friendly error
      console.error('[PiBridge] No text extracted from events. Stderr:', this.client.getStderr());
      return {
        success: false,
        reason: 'Pi agent did not produce a text response',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'erro desconhecido';
      console.error('[PiBridge] Exception:', errorMessage, '| Stderr:', this.client.getStderr());
      return {
        success: false,
        reason: errorMessage,
      };
    }
  }

  async stop(): Promise<void> {
    if (this.started) {
      await this.client.stop();
      this.started = false;
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