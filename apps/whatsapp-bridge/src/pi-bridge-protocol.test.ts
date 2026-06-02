// ─────────────────────────────────────────────────────────────────────────────
// PiBridge Protocol Tests
// Tests against the REAL Pi RPC protocol (response ACK, streaming, turn_end)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock child_process BEFORE importing PiBridge
const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }));
vi.mock('child_process', () => ({
  spawn: mockSpawn,
}));

import { PiBridge } from './pi-bridge.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface MockChildProcess extends EventEmitter {
  stdin: { write: ReturnType<typeof vi.fn> };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
}

function createMockProc(): MockChildProcess {
  const proc = new EventEmitter() as MockChildProcess;
  proc.stdin = { write: vi.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn();
  proc.exitCode = null;
  return proc;
}

// ─────────────────────────────────────────────────────────────────────────────
// extractTextFromPiMessage helper - covers all 3 real-world formats
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge.extractTextFromPiMessage', () => {
  const extract = (bridge: PiBridge) => (msg: unknown) =>
    (bridge as any).extractTextFromPiMessage(msg);

  it('extracts from turn_end message.content[0].text (real protocol)', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    const msg = {
      type: 'turn_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Resposta final completa' }],
      },
    };
    expect(extract(bridge)(msg)).toBe('Resposta final completa');
  });

  it('extracts from message_update assistantMessageEvent.delta (text_delta)', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    const msg = {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_delta', delta: 'olá ' },
    };
    expect(extract(bridge)(msg)).toBe('olá ');
  });

  it('extracts from message_update assistantMessageEvent.content (text_end)', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    const msg = {
      type: 'message_update',
      assistantMessageEvent: { type: 'text_end', content: 'texto completo' },
    };
    expect(extract(bridge)(msg)).toBe('texto completo');
  });

  it('falls back to legacy root-level text field', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({ type: 'legacy', text: 'legacy text' })).toBe('legacy text');
  });

  it('falls back to legacy root-level delta field', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({ type: 'legacy', delta: 'legacy delta' })).toBe('legacy delta');
  });

  it('falls back to legacy root-level text_delta field', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({ type: 'legacy', text_delta: 'legacy td' })).toBe('legacy td');
  });

  it('returns empty string for empty message', () => {
    const bridge = new PiBridge({ householdId: 'h1' });
    expect(extract(bridge)({})).toBe('');
    expect(extract(bridge)(null)).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleMessage - protocol behavior
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge handleMessage - real protocol', () => {
  let bridge: PiBridge;

  beforeEach(() => {
    bridge = new PiBridge({ householdId: 'h1', timeoutMs: 60000 });
  });

  it('type "response" is an ACK and does NOT resolve the pending request', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    const rejectSpy = vi.fn();
    (bridge as any).activeRequests.set('test-3', {
      resolve: resolveSpy,
      reject: rejectSpy,
      timeout: setTimeout(() => {}, 1000),
      startedAt: Date.now(),
    });

    handleMessage({
      type: 'response',
      id: 'test-3',
      command: 'prompt',
      success: true,
    });

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(rejectSpy).not.toHaveBeenCalled();
    expect((bridge as any).activeRequests.has('test-3')).toBe(true);
  });

  it('accumulates text_delta from message_update events', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    (bridge as any).activeRequests.set('req-1', {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeout: setTimeout(() => {}, 1000),
      startedAt: Date.now(),
    });

    handleMessage({
      type: 'message_update',
      id: 'req-1',
      assistantMessageEvent: { type: 'text_delta', delta: 'olá ' },
    });
    handleMessage({
      type: 'message_update',
      id: 'req-1',
      assistantMessageEvent: { type: 'text_delta', delta: 'mundo' },
    });

    const acc = (bridge as any).accumulatedText.get('req-1');
    expect(acc).toBe('olá mundo');
  });

  it('turn_end resolves pending request with message.content[0].text', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('req-2', {
      resolve: resolveSpy,
      reject: vi.fn(),
      timeout: setTimeout(() => {}, 1000),
      startedAt: Date.now(),
    });

    handleMessage({
      type: 'turn_end',
      id: 'req-2',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Resposta consolidada' }],
      },
    });

    expect(resolveSpy).toHaveBeenCalledWith('Resposta consolidada');
    expect((bridge as any).activeRequests.has('req-2')).toBe(false);
  });

  it('agent_end is a fallback that resolves with accumulatedText if not yet resolved', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('req-3', {
      resolve: resolveSpy,
      reject: vi.fn(),
      timeout: setTimeout(() => {}, 1000),
      startedAt: Date.now(),
    });
    (bridge as any).accumulatedText.set('req-3', 'fallback text from stream');

    handleMessage({ type: 'agent_end', id: 'req-3' });

    expect(resolveSpy).toHaveBeenCalledWith('fallback text from stream');
    expect((bridge as any).activeRequests.has('req-3')).toBe(false);
  });

  it('agent_end does NOT double-resolve if turn_end already resolved', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    const resolveSpy = vi.fn();
    (bridge as any).activeRequests.set('req-4', {
      resolve: resolveSpy,
      reject: vi.fn(),
      timeout: setTimeout(() => {}, 1000),
      startedAt: Date.now(),
    });

    handleMessage({
      type: 'turn_end',
      id: 'req-4',
      message: { role: 'assistant', content: [{ type: 'text', text: 'final' }] },
    });
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    handleMessage({ type: 'agent_end', id: 'req-4' });
    expect(resolveSpy).toHaveBeenCalledTimes(1);
  });

  it('cleans up accumulatedText when request resolves', () => {
    const handleMessage = (bridge as any).handleMessage.bind(bridge);
    (bridge as any).activeRequests.set('req-5', {
      resolve: vi.fn(),
      reject: vi.fn(),
      timeout: setTimeout(() => {}, 1000),
      startedAt: Date.now(),
    });
    (bridge as any).accumulatedText.set('req-5', 'streamed text');

    handleMessage({
      type: 'turn_end',
      id: 'req-5',
      message: { role: 'assistant', content: [{ type: 'text', text: 'final' }] },
    });

    expect((bridge as any).accumulatedText.has('req-5')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// spawn() configuration
// ─────────────────────────────────────────────────────────────────────────────

describe('PiBridge spawn configuration', () => {
  let mockProc: MockChildProcess;

  beforeEach(() => {
    mockProc = createMockProc();
    mockSpawn.mockReset();
    mockSpawn.mockReturnValue(mockProc);
  });

  it('spawn is called with shell: true for Windows .cmd resolution', async () => {
    const bridge = new PiBridge({
      householdId: 'h1',
      piCommand: 'pi',
      projectDir: '/tmp/proj',
      timeoutMs: 60000,
    });

    await bridge.start();

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const opts = mockSpawn.mock.calls[0][2];
    expect(opts.shell).toBe(true);

    await bridge.stop();
  });

  it('spawn is called with correct command and args', async () => {
    const bridge = new PiBridge({
      householdId: 'h1',
      piCommand: 'pi',
      timeoutMs: 60000,
    });

    await bridge.start();

    expect(mockSpawn.mock.calls[0][0]).toBe('pi');
    expect(mockSpawn.mock.calls[0][1]).toEqual(['--mode', 'rpc']);

    await bridge.stop();
  });
});
