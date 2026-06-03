// ─────────────────────────────────────────────────────────────────────────────
// PiBridge Protocol Tests
// Tests: real Pi RPC protocol (ACK, streaming, turn_end, agent_end)
// Tests: events without id → currentRequestId matching
// Tests: global serialization (one request at a time)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn: mockSpawn }));

import { PiBridge } from './pi-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// extractTextFromPiMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge.extractTextFromPiMessage', () => {
  const extract = (bridge: PiBridge) => (msg: unknown) =>
    (bridge as any).extractTextFromPiMessage(msg);

  it('extracts from turn_end message.content[0].text', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({
      type: 'turn_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
    })).toBe('ok');
  });

  it('extracts from assistantMessageEvent.delta (text_delta)', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'hi ' },
    })).toBe('hi ');
  });

  it('extracts from assistantMessageEvent.content (text_end)', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({
      type: 'message_update',
      assistantMessageEvent: { type: 'text_end', content: 'full text' },
    })).toBe('full text');
  });

  it('falls back to legacy root-level fields', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({ text: 'legacy' })).toBe('legacy');
    expect(extract(bridge)({ delta: 'ld' })).toBe('ld');
    expect(extract(bridge)({ text_delta: 'td' })).toBe('td');
  });

  it('returns empty string for empty/null', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({})).toBe('');
    expect(extract(bridge)(null)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleMessage - protocol behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge handleMessage - protocol', () => {
  let bridge: PiBridge;

  beforeEach(() => { bridge = new PiBridge({ householdId: 'h1', timeoutMs: 60000 }); });

  // ACK: type 'response' does NOT resolve
  it('type "response" is an ACK and does NOT resolve the pending request', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('test-3', {
      resolve: resolveSpy, reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'test-3', message: 'x', chatId: 'c1',
    });

    handleMessage({ type: 'response', id: 'test-3', command: 'prompt', success: true });

    expect(resolveSpy).not.toHaveBeenCalled();
    expect((bridge as any).activeRequests.has('test-3')).toBe(true);
  });

  // Stream: message_update accumulates
  it('message_update accumulates text_delta in accumulatedText', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    (bridge as any).activeRequests.set('req-1', {
      resolve: vi.fn(), reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'req-1', message: 'x', chatId: 'c1',
    });

    handleMessage({ type: 'message_update', id: 'req-1', assistantMessageEvent: { type: 'text_delta', delta: 'hi' } });
    expect((bridge as any).accumulatedText.get('req-1')).toBe('hi');

    handleMessage({ type: 'message_update', id: 'req-1', assistantMessageEvent: { type: 'text_delta', delta: ' there' } });
    expect((bridge as any).accumulatedText.get('req-1')).toBe('hi there');
  });

  // turn_end with id → resolves
  it('turn_end with id resolves the pending request', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    const pending = {
      resolve: resolveSpy, reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'req-2', message: 'x', chatId: 'c1',
    };
    (bridge as any).activeRequests.set('req-2', pending);

    handleMessage({
      type: 'turn_end', id: 'req-2',
      message: { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] },
    });

    expect(resolveSpy).toHaveBeenCalledWith('final answer');
    expect((bridge as any).activeRequests.has('req-2')).toBe(false);
  });

  // agent_end with id → resolves (fallback)
  it('agent_end with id resolves the pending request as fallback', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('req-3', {
      resolve: resolveSpy, reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'req-3', message: 'x', chatId: 'c1',
    });

    handleMessage({ type: 'agent_end', id: 'req-3', text: 'agent fallback text' });

    expect(resolveSpy).toHaveBeenCalledWith('agent fallback text');
    expect((bridge as any).activeRequests.has('req-3')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleMessage - events WITHOUT id (currentRequestId matching)
// These are the events Pi RPC actually sends — turn_end/agent_end lack id
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge handleMessage - events without id (currentRequestId)', () => {
  let bridge: PiBridge;

  beforeEach(() => { bridge = new PiBridge({ householdId: 'h1', timeoutMs: 60000 }); });

  it('turn_end WITHOUT id resolves the currentRequestId', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('req-current', {
      resolve: resolveSpy, reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'req-current', message: 'x', chatId: 'c1',
    });
    // Simulate: prompt was sent, currentRequestId is set
    (bridge as any).currentRequestId = 'req-current';

    // turn_end has NO id (real Pi RPC behavior)
    handleMessage({
      type: 'turn_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'final from pi' }] },
    });

    expect(resolveSpy).toHaveBeenCalledWith('final from pi');
    expect((bridge as any).currentRequestId).toBe(null);
    expect((bridge as any).activeRequests.has('req-current')).toBe(false);
  });

  it('agent_end WITHOUT id resolves the currentRequestId as fallback', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('req-agent', {
      resolve: resolveSpy, reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'req-agent', message: 'x', chatId: 'c1',
    });
    (bridge as any).currentRequestId = 'req-agent';

    handleMessage({ type: 'agent_end', text: 'agent resolved' });

    expect(resolveSpy).toHaveBeenCalledWith('agent resolved');
    expect((bridge as any).currentRequestId).toBe(null);
  });

  it('message_update WITHOUT id accumulates into currentRequestId', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    (bridge as any).activeRequests.set('req-stream', {
      resolve: vi.fn(), reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'req-stream', message: 'x', chatId: 'c1',
    });
    (bridge as any).currentRequestId = 'req-stream';

    handleMessage({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'chunk1' } });
    handleMessage({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'chunk2' } });

    expect((bridge as any).accumulatedText.get('req-stream')).toBe('chunk1chunk2');
  });

  it('agent_end does NOT double-resolve after turn_end already resolved', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('req-dup', {
      resolve: resolveSpy, reject: vi.fn(),
      timeout: setTimeout(() => {}), startedAt: Date.now(),
      requestId: 'req-dup', message: 'x', chatId: 'c1',
    });
    (bridge as any).currentRequestId = 'req-dup';

    // First: turn_end resolves
    handleMessage({ type: 'turn_end', message: { content: [{ text: 'first' }] } });
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith('first');

    // Second: agent_end — request already gone, should NOT call resolve again
    handleMessage({ type: 'agent_end', text: 'second' });
    expect(resolveSpy).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  it('event without id is ignored when no currentRequestId is active', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).currentRequestId = null; // no active request

    // Should not throw or crash
    handleMessage({ type: 'turn_end', message: { content: [{ text: 'orphan' }] } });
    handleMessage({ type: 'agent_end', text: 'orphan-agent' });
    handleMessage({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'x' } });

    expect(resolveSpy).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queue serialization
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge queue serialization', () => {
  let bridge: PiBridge;

  beforeEach(() => {
    mockSpawn.mockReset();
    const proc = new EventEmitter() as any;
    proc.stdin = { write: vi.fn() };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();
    proc.exitCode = null;
    mockSpawn.mockReturnValue(proc);

    bridge = new PiBridge({ householdId: 'h1', timeoutMs: 60000 });
  });

  it('sends immediately when no other request is active', async () => {
    await bridge.start();
    const proc = mockSpawn.mock.results[0].value;

    const sendPromise = bridge.send('hello', 'chat-1');
    // Pump stdout with ACK
    proc.stdout.emit('data', '{"type":"response","id":"1","command":"prompt","success":true}\n');
    proc.stdout.emit('data', '{"type":"turn_end","message":{"content":[{"text":"ok"}]}}\n');

    await expect(sendPromise).resolves.toBe('ok');
  });

  it('second send waits for first to complete before sending', async () => {
    await bridge.start();
    const proc = mockSpawn.mock.results[0].value;

    const p1 = bridge.send('msg1', 'chat-1');
    void bridge.send('msg2', 'chat-1'); // queued, not awaited

    // Pump ACK + turn_end for first request
    proc.stdout.emit('data', '{"type":"response","command":"prompt","success":true}\n');
    proc.stdout.emit('data', '{"type":"turn_end","message":{"content":[{"text":"resp1"}]}}\n');

    await expect(p1).resolves.toBe('resp1');

    // Second request should now be sent
    const writeCall = proc.stdin.write.mock.calls.find(
      (c: unknown[]) => (c[0] as string).includes('msg2')
    );
    expect(writeCall).toBeDefined();
  });

  it('requests on different chats are serialized globally (Pi is single-process)', async () => {
    await bridge.start();
    const proc = mockSpawn.mock.results[0].value;

    const p1 = bridge.send('msg1', 'chat-A');
    void bridge.send('msg2', 'chat-B'); // different chat, queued

    // Both queued — second should NOT be sent until first resolves
    const writesBeforeResolve = proc.stdin.write.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('msg')
    );
    expect(writesBeforeResolve).toHaveLength(1); // only msg1

    // Resolve first
    proc.stdout.emit('data', '{"type":"response","command":"prompt","success":true}\n');
    proc.stdout.emit('data', '{"type":"turn_end","message":{"content":[{"text":"r1"}]}}\n');
    await expect(p1).resolves.toBe('r1');

    // Now msg2 should be sent
    const writesAfterResolve = proc.stdin.write.mock.calls.filter(
      (c: unknown[]) => (c[0] as string).includes('msg2')
    );
    expect(writesAfterResolve).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Timeout
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge timeout', () => {
  it('bridge default timeout is 120000ms', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect((bridge as any).options.timeoutMs).toBe(120000);
  });

  it('timeout rejects the pending request', async () => {
    mockSpawn.mockReset();
    const proc = new EventEmitter() as any;
    proc.stdin = { write: vi.fn() };
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = vi.fn();
    proc.exitCode = null;
    mockSpawn.mockReturnValue(proc);

    const bridge = new PiBridge({ householdId: 'h1', timeoutMs: 50 });

    await bridge.start();
    const sendPromise = bridge.send('test', 'c1');

    await expect(sendPromise).rejects.toThrow('timed out after 50ms');
  });
});
