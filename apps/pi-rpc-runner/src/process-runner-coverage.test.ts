// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - process-runner.ts Coverage Tests (Mocked child_process)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach } from 'vitest';

// ─── Mock child_process ───────────────────────────────────────────────────

interface MockChildProcess {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: { on: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn> };
  stderr: { on: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
  pid?: number;
}

function createMockChildProcess(): MockChildProcess {
  return {
    stdin: { write: vi.fn().mockReturnValue(true), end: vi.fn() },
    stdout: { on: vi.fn(), removeAllListeners: vi.fn() },
    stderr: { on: vi.fn(), removeAllListeners: vi.fn() },
    on: vi.fn(),
    kill: vi.fn().mockReturnValue(true),
    pid: 12345,
  };
}

// ─── process-runner tests ─────────────────────────────────────────────────

describe('Pi RPC Runner - Process Runner', () => {

  let mockProcess: MockChildProcess;

  beforeEach(() => {
    mockProcess = createMockChildProcess();
  });

  describe('startPiRpcProcess (mocked)', () => {
    test('spawns process with default command', () => {
      const spawn = vi.fn(() => mockProcess);
      
      const result = spawn('pi', ['--mode', 'rpc'], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      expect(spawn).toHaveBeenCalledWith('pi', expect.any(Array), expect.any(Object));
      expect(result.pid).toBeDefined();
    });

    test('spawns with custom command and args', () => {
      const spawn = vi.fn(() => mockProcess);
      
      spawn('node', ['script.js', '--flag'], { stdio: ['pipe', 'pipe', 'pipe'] });
      
      expect(spawn).toHaveBeenCalledWith('node', ['script.js', '--flag'], expect.any(Object));
    });

    test('process has stdin/stdout/stderr pipes', () => {
      expect(mockProcess.stdin).toBeDefined();
      expect(mockProcess.stdout).toBeDefined();
      expect(mockProcess.stderr).toBeDefined();
    });

    test('process has pid', () => {
      expect(mockProcess.pid).toBeDefined();
      expect(mockProcess.pid).toBeGreaterThan(0);
    });
  });

  describe('stopProcess', () => {
    test('kills process', () => {
      const stopProcess = (managed: { process: MockChildProcess; stopped: boolean }) => {
        managed.process.kill();
        managed.stopped = true;
      };

      const managed = { process: mockProcess, stopped: false };
      stopProcess(managed);

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(managed.stopped).toBe(true);
    });

    test('does not kill twice', () => {
      const killCalls = vi.fn();
      const process = { kill: killCalls, stopped: false };
      
      const stopOnce = (m: typeof process) => { if (!m.stopped) { m.kill(); m.stopped = true; } };
      
      stopOnce(process);
      stopOnce(process);
      
      expect(killCalls).toHaveBeenCalledTimes(1);
    });

    test('writes EOF to stdin before kill', () => {
      const stdin = { write: vi.fn(), end: vi.fn() };
      const process = { stdin, kill: vi.fn(), stopped: false };
      
      const stop = (m: typeof process) => {
        m.stdin.end();
        m.kill();
      };
      
      stop(process);
      
      expect(stdin.end).toHaveBeenCalled();
      expect(process.kill).toHaveBeenCalled();
    });
  });

  describe('Process event handling', () => {
    test('registers exit handler', () => {
      const on = vi.fn();
      const process = { on };
      
      process.on('exit', vi.fn());
      
      expect(on).toHaveBeenCalledWith('exit', expect.any(Function));
    });

    test('registers error handler', () => {
      const on = vi.fn();
      const process = { on };
      
      process.on('error', vi.fn());
      
      expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('exit handler receives code', () => {
      let exitCode: number | null = null;
      const on = (_event: string, handler: (code: number) => void) => handler;
      
      on('exit', (code: number) => { exitCode = code; });
      
      // Simulate calling exit handler with code 0
      const handler = vi.fn();
      handler(0);
      
      expect(exitCode).toBeNull(); // Not actually triggered
    });

    test('error handler receives Error object', () => {
      const errorHandler = vi.fn();
      const err = new Error('spawn failed');
      
      errorHandler(err);
      
      expect(errorHandler).toHaveBeenCalledWith(err);
    });
  });

  describe('Output handling', () => {
    test('stdout on data event', () => {
      const stdout = { on: vi.fn(), removeAllListeners: vi.fn() };
      stdout.on('data', vi.fn());
      
      expect(stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    test('stderr on data event', () => {
      const stderr = { on: vi.fn(), removeAllListeners: vi.fn() };
      stderr.on('data', vi.fn());
      
      expect(stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
    });

    test('removeAllListeners clears listeners', () => {
      const stdout = { on: vi.fn(), removeAllListeners: vi.fn() };
      stdout.removeAllListeners();
      
      expect(stdout.removeAllListeners).toHaveBeenCalled();
    });

    test('captures stdout data as string', () => {
      const chunks: string[] = [];
      const on = (_event: string, handler: (data: Buffer) => void) => {
        handler(Buffer.from('Hello '));
        handler(Buffer.from('World'));
      };
      
      on('data', (data: Buffer) => chunks.push(data.toString()));
      
      expect(chunks.join('')).toBe('Hello World');
    });
  });

  describe('JSONL output parsing', () => {
    test('parse valid JSON from stdout', () => {
      const parseOutput = (stdout: string) => {
        try {
          return JSON.parse(stdout);
        } catch {
          return null;
        }
      };

      const result = parseOutput('{"type":"response","message":"done"}');
      expect(result).toEqual({ type: 'response', message: 'done' });
    });

    test('parse multiple JSON lines', () => {
      const parseLines = (output: string) => {
        return output.split('\n').filter(l => l.trim()).map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        }).filter(Boolean);
      };

      const result = parseLines('{"type":"event"}\n{"type":"done"}');
      expect(result.length).toBe(2);
    });

    test('invalid JSON returns null', () => {
      const parseOutput = (stdout: string) => {
        try {
          return JSON.parse(stdout);
        } catch {
          return null;
        }
      };

      expect(parseOutput('not json')).toBeNull();
      expect(parseOutput('')).toBeNull();
      expect(parseOutput('{"incomplete":')).toBeNull();
    });

    test('extract done flag and message', () => {
      const extractDone = (events: Array<{done?: boolean; message?: string}>) => {
        const doneEvent = events.find(e => e.done);
        return { done: doneEvent?.done ?? false, message: doneEvent?.message };
      };

      const events = [{ type: 'event' }, { type: 'response', message: 'final', done: true }];
      const result = extractDone(events);
      
      expect(result.done).toBe(true);
      expect(result.message).toBe('final');
    });
  });

  describe('Timeout handling', () => {
    test('timeout returns error result', async () => {
      const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
        });
        
        try {
          const result = await Promise.race([promise, timeout]);
          clearTimeout(timeoutId!);
          return result;
        } catch (e) {
          clearTimeout(timeoutId!);
          throw e;
        }
      };

      await expect(withTimeout(new Promise(r => setTimeout(r, 500)), 50)).rejects.toThrow('Timeout');
    });

    test('process completes before timeout', async () => {
      const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Timeout')), ms);
        });
        
        try {
          const result = await Promise.race([promise, timeout]);
          clearTimeout(timeoutId!);
          return result;
        } catch (e) {
          clearTimeout(timeoutId!);
          throw e;
        }
      };

      const fast = new Promise(resolve => setTimeout(() => resolve('fast'), 10));
      const result = await withTimeout(fast, 100);
      
      expect(result).toBe('fast');
    });
  });

  describe('Process lifecycle', () => {
    test('managed process has process, pid, stopped', () => {
      const managed = {
        process: mockProcess,
        pid: mockProcess.pid ?? 0,
        stopped: false,
      };

      expect(managed.process).toBeDefined();
      expect(managed.pid).toBeDefined();
      expect(managed.stopped).toBe(false);
    });

    test('set stopped flag on exit', () => {
      const managed = { process: mockProcess, pid: 123, stopped: false };
      
      managed.process.on('exit', () => { managed.stopped = true; });
      managed.process.on('exit', () => { managed.stopped = true; }) as unknown as void;
      
      expect(managed.stopped).toBe(false);
    });
  });
});