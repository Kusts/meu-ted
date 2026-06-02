import { describe, expect, test, vi } from 'vitest';
import { EventEmitter } from 'events';
import { createJsonlClient } from './rpc-client.js';

class FakeStdout extends EventEmitter {}

describe('JsonlClient sendPrompt', () => {
  test('resolves concatenated message_update deltas on done', async () => {
    const stdout = new FakeStdout();
    const stdin = { write: vi.fn(), end: vi.fn() };
    const proc = { stdout, stdin } as any;
    const client = createJsonlClient(proc, { timeoutMs: 1000 });

    const responsePromise = client.sendPrompt('oi');
    stdout.emit('data', Buffer.from('{"type":"message_update","delta":"Olá"}\n'));
    stdout.emit('data', Buffer.from('{"type":"message_update","delta":" TED"}\n'));
    stdout.emit('data', Buffer.from('{"type":"done"}\n'));

    await expect(responsePromise).resolves.toBe('Olá TED');
    expect(stdin.write).toHaveBeenCalledWith(JSON.stringify({ type: 'prompt', message: 'oi' }) + '\n');
  });

  test('resolves Pi RPC assistant message_end content', async () => {
    const stdout = new FakeStdout();
    const stdin = { write: vi.fn(), end: vi.fn() };
    const proc = { stdout, stdin } as any;
    const client = createJsonlClient(proc, { timeoutMs: 1000 });

    const responsePromise = client.sendPrompt('oi');
    stdout.emit('data', Buffer.from('{"type":"response","command":"prompt","success":true}\n'));
    stdout.emit('data', Buffer.from('{"type":"message_end","message":{"role":"user","content":[{"type":"text","text":"oi"}]}}\n'));
    stdout.emit('data', Buffer.from('{"type":"message_update","message":{"role":"assistant","content":[{"type":"text","text":"Olá"}]}}\n'));
    stdout.emit('data', Buffer.from('{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Olá TED"}]}}\n'));

    await expect(responsePromise).resolves.toBe('Olá TED');
  });
});
