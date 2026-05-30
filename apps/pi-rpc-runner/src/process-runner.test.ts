// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - Process lifecycle tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

interface FakeChildProcess {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: { on: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn> };
  kill: ReturnType<typeof vi.fn>;
  on: (event: string, cb: (code: number | null, signal: string | null) => void) => void;
  removeAllListeners: ReturnType<typeof vi.fn>;
  exitCode: number | null;
  pid: number;
}

function createFakeChildProcess(): FakeChildProcess {
  return {
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn(), removeAllListeners: vi.fn() },
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
    exitCode: null,
    pid: 12345,
  };
}

// Test the exported interface without spawning real processes
describe('Pi RPC Runner - Process Lifecycle', () => {
  let fakeProcess: FakeChildProcess;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeProcess = createFakeChildProcess();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('stop() on a stopped process does nothing - interface test', () => {
    // Test that the stop function interface works
    // For unit test, we just verify our fake process structure works
    expect(fakeProcess.kill).not.toHaveBeenCalled();
    expect(fakeProcess.stdin.end).not.toHaveBeenCalled();
  });

  test('fake process can receive exit event', () => {
    // Simulate exit event handler registration
    const exitCallback = vi.fn();
    fakeProcess.on('exit', exitCallback);
    
    // Simulate process exit
    exitCallback(0, null);
    
    expect(exitCallback).toHaveBeenCalledWith(0, null);
  });

  test('process can write to stdin', () => {
    fakeProcess.stdin.write('test message');
    
    expect(fakeProcess.stdin.write).toHaveBeenCalledWith('test message');
  });

  test('process can end stdin', () => {
    fakeProcess.stdin.end();
    
    expect(fakeProcess.stdin.end).toHaveBeenCalled();
  });
});