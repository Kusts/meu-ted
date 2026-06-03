import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPiClient } from './pi-client-factory.js';

describe('createPiClient', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.PI_AGENT_RUNTIME = 'pi-native';
  });

  afterEach(() => {
    process.env = { ...env };
  });

  // ── cliPath resolution (FIRST — must resolve from installed package) ────

  it('resolves cliPath from the installed @earendil-works/pi-coding-agent package', async () => {
    // Use the same walk-up approach as the factory: start from the test file's
    // directory (src/), walk up until we find the node_modules, resolve the real
    // path via realpathSync to follow pnpm symlinks.
    const { realpathSync } = await import('fs');
    const __filename = fileURLToPath(import.meta.url);
    let dir = path.dirname(__filename);
    let realCli = '';
    for (let i = 0; i < 10; i++) {
      const candidate = path.resolve(dir, 'node_modules/@earendil-works/pi-coding-agent/dist/cli.js');
      try { realCli = realpathSync(candidate); break; } catch {}
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    expect(realCli).not.toBe('');
    expect(realCli).toMatch(/node_modules[/\\].*[/\\]@earendil-works[/\\]pi-coding-agent[/\\]dist[/\\]cli\.js$/);

    // The factory's cliPath must resolve to the same real path
    const client = createPiClient('default') as any;
    const realClientCliPath = realpathSync(client.client.options.cliPath);
    expect(realClientCliPath).toBe(realCli);
  });

  it('returns spawn/path error reason when RpcClient.start fails', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockRejectedValue(
        new Error(
          "Cannot find module 'D:\\projetos\\pi-financeiro\\apps\\whatsapp-bridge\\dist\\cli.js'",
        ),
      ),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockResolvedValue([]),
      getLastAssistantText: vi.fn().mockResolvedValue(null),
      getStderr: vi.fn().mockReturnValue(''),
    };
    // started=false → start() is called and throws before promptAndWait
    client.started = false;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Cannot find module');
  });

  // ── text extraction from message_end content ─────────────────────────────

  it('extracts text from message_end with type:text block', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockResolvedValue([
        {
          type: 'message_end',
          message: { role: 'assistant', content: [{ type: 'text', text: 'resposta do TED' }] },
        },
        { type: 'agent_end', messages: [] },
      ]),
      getLastAssistantText: vi.fn().mockResolvedValue(null),
      getStderr: vi.fn().mockReturnValue(''),
    };
    client.started = true;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result).toEqual({ success: true, data: { message: 'resposta do TED' } });
  });

  it('extracts text from message_end with plain {text} object (no type)', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockResolvedValue([
        {
          type: 'message_end',
          message: { content: [{ text: 'plain text response' }] },
        },
        { type: 'agent_end' },
      ]),
      getLastAssistantText: vi.fn().mockResolvedValue(null),
      getStderr: vi.fn().mockReturnValue(''),
    };
    client.started = true;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result).toEqual({ success: true, data: { message: 'plain text response' } });
  });

  it('skips thinking block and picks text block in multi-block content', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockResolvedValue([
        {
          type: 'message_end',
          message: {
            content: [
              { type: 'thinking', text: 'analisando...' },
              { type: 'text', text: 'resposta final' },
            ],
          },
        },
        { type: 'agent_end' },
      ]),
      getLastAssistantText: vi.fn().mockResolvedValue(null),
      getStderr: vi.fn().mockReturnValue(''),
    };
    client.started = true;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result).toEqual({ success: true, data: { message: 'resposta final' } });
  });

  // ── fallback to getLastAssistantText ─────────────────────────────────────

  it('falls back to getLastAssistantText when no text in events', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockResolvedValue([{ type: 'agent_end' }]),
      getLastAssistantText: vi.fn().mockResolvedValue('fallback text'),
      getStderr: vi.fn().mockReturnValue(''),
    };
    client.started = true;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result).toEqual({ success: true, data: { message: 'fallback text' } });
  });

  // ── error cases ────────────────────────────────────────────────────────────

  it('returns error when no text in events AND getLastAssistantText returns null', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockResolvedValue([{ type: 'agent_end' }]),
      getLastAssistantText: vi.fn().mockResolvedValue(null),
      getStderr: vi.fn().mockReturnValue(''),
    };
    client.started = true;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result).toEqual({
      success: false,
      reason: 'Pi agent did not produce a text response',
    });
  });

  it('returns error when client throws (process exit)', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockRejectedValue(
        new Error('Agent process exited (code=1 signal=null). Stderr: provider error'),
      ),
      getLastAssistantText: vi.fn().mockResolvedValue(null),
      getStderr: vi.fn().mockReturnValue('provider error'),
    };
    client.started = true;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Agent process exited');
  });

  it('returns error when promptAndWait times out', async () => {
    const client = createPiClient('default') as any;
    client.client = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      promptAndWait: vi.fn().mockRejectedValue(
        new Error('Timeout waiting for agent to become idle. Stderr: '),
      ),
      getLastAssistantText: vi.fn().mockResolvedValue(null),
      getStderr: vi.fn().mockReturnValue(''),
    };
    client.started = true;

    const result = await client.send('hello', '5511999999999', {
      source: 'whatsapp',
      chatId: '5511999999999@s.whatsapp.net',
      providerMessageId: 'provider-1',
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Timeout waiting');
  });
});