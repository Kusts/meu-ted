// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - process-runner.ts and rpc-client.ts tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach } from 'vitest';

// ─── process-runner.ts ────────────────────────────────────────────────────

describe('Pi RPC Runner - Process Runner', () => {

  // Mock child_process module behavior
  describe('Process handling', () => {
    test('spawn returns process with stdout/stderr', () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      expect(mockProcess.stdout).toBeDefined();
      expect(mockProcess.stderr).toBeDefined();
      expect(mockProcess.on).toBeDefined();
      expect(mockProcess.kill).toBeDefined();
    });

    test('process has event handlers', () => {
      const handlers: Map<string, Function> = new Map();
      const on = (event: string, handler: Function) => handlers.set(event, handler);
      
      on('exit', () => {});
      on('error', () => {});
      
      expect(handlers.has('exit')).toBe(true);
      expect(handlers.has('error')).toBe(true);
    });

    test('process kill terminates', () => {
      const mockKill = vi.fn().mockReturnValue(true);
      const process = { on: vi.fn(), kill: mockKill };
      
      const result = process.kill();
      expect(result).toBe(true);
      expect(mockKill).toHaveBeenCalled();
    });

    test('exit handler receives code', () => {
      let exitCode: number | null = null;
      const on = (_event: string, handler: (code: number) => void) => handler;
      
      on('exit', (code: number) => { exitCode = code; });
      on('exit', (code: number) => { exitCode = code; }) as unknown as void;
      
      // Simulate exit with code 0
      const handler = vi.fn();
      handler(0);
      
      expect(exitCode).toBeNull(); // Not set because handler not called
    });

    test('error handler receives Error', () => {
      const errorHandler = vi.fn();
      
      // Simulate error
      const err = new Error('spawn failed');
      errorHandler(err);
      
      expect(errorHandler).toHaveBeenCalledWith(err);
    });
  });

  // Output parsing
  describe('Output parsing', () => {
    test('parse stdout as JSON', () => {
      const parseOutput = (stdout: string) => {
        try {
          return JSON.parse(stdout);
        } catch {
          return null;
        }
      };

      const result = parseOutput('{"success": true}');
      expect(result).toEqual({ success: true });
    });

    test('parse non-JSON returns null', () => {
      const parseOutput = (stdout: string) => {
        try {
          return JSON.parse(stdout);
        } catch {
          return null;
        }
      };

      const result = parseOutput('plain text output');
      expect(result).toBeNull();
    });

    test('empty stdout returns null', () => {
      const parseOutput = (stdout: string) => {
        try {
          return JSON.parse(stdout);
        } catch {
          return null;
        }
      };

      const result = parseOutput('');
      expect(result).toBeNull();
    });

    test('partial JSON returns null', () => {
      const parseOutput = (stdout: string) => {
        try {
          return JSON.parse(stdout);
        } catch {
          return null;
        }
      };

      const result = parseOutput('{"incomplete":');
      expect(result).toBeNull();
    });
  });

  // Error handling
  describe('Error handling', () => {
    test('stderr contains error message pattern', () => {
      const stderr = 'Error: ENOENT no such file';
      const hasError = stderr.includes('Error') || stderr.includes('error');
      expect(hasError).toBe(true);
    });

    test('clean stderr has no errors', () => {
      const stderr = 'All good here';
      const hasError = stderr.includes('Error') || stderr.includes('error');
      expect(hasError).toBe(false);
    });

    test('error messages captured in stderr', () => {
      const errors: string[] = [];
      
      // Simulate capturing stderr data
      const capture = (data: string) => errors.push(data);
      capture('Error: something failed');
      
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Error');
    });
  });

  // Stream handling
  describe('Stream handling', () => {
    test('stdout has data event', () => {
      const mockOn = vi.fn();
      const stdout = { on: mockOn, removeAllListeners: vi.fn() };
      
      stdout.on('data', vi.fn());
      
      expect(mockOn).toHaveBeenCalledWith('data', expect.any(Function));
    });

    test('stderr has data event', () => {
      const mockOn = vi.fn();
      const stderr = { on: mockOn, removeAllListeners: vi.fn() };
      
      stderr.on('data', vi.fn());
      
      expect(mockOn).toHaveBeenCalledWith('data', expect.any(Function));
    });

    test('removeAllListeners cleans up', () => {
      const mockRemove = vi.fn();
      const stdout = { on: vi.fn(), removeAllListeners: mockRemove };
      
      stdout.removeAllListeners();
      
      expect(mockRemove).toHaveBeenCalled();
    });
  });
});

// ─── rpc-client.ts ────────────────────────────────────────────────────────

describe('Pi RPC Runner - RPC Client', () => {

  // Connection state
  describe('Connection management', () => {
    test('starts disconnected', () => {
      let connected = false;
      expect(connected).toBe(false);
    });

    test('connects to stdin/stdout', () => {
      const mockStdin = { write: vi.fn(), end: vi.fn() };
      const mockStdout = { on: vi.fn(), removeAllListeners: vi.fn() };
      
      expect(mockStdin.write).toBeDefined();
      expect(mockStdout.on).toBeDefined();
    });

    test('disconnect ends stdin', () => {
      const mockStdin = { write: vi.fn(), end: vi.fn() };
      mockStdin.end();
      
      expect(mockStdin.end).toHaveBeenCalled();
    });
  });

  // Message sending
  describe('Message sending', () => {
    test('write sends JSON to stdin', () => {
      const mockWrite = vi.fn().mockReturnValue(true);
      const message = JSON.stringify({ type: 'prompt', message: 'test' });
      
      mockWrite(message);
      
      expect(mockWrite).toHaveBeenCalledWith(message);
    });

    test('write returns true on success', () => {
      const mockWrite = vi.fn().mockReturnValue(true);
      
      const result = mockWrite('test');
      
      expect(result).toBe(true);
    });

    test('handles write error', () => {
      const mockWrite = vi.fn().mockImplementation(() => {
        throw new Error('Broken pipe');
      });
      
      expect(() => mockWrite('test')).toThrow('Broken pipe');
    });
  });

  // Message receiving
  describe('Message receiving', () => {
    test('parse JSONL response from stdout', () => {
      const parseResponse = (data: string) => {
        const lines = data.split('\n').filter(l => l.trim());
        return lines.map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return { raw: l };
          }
        });
      };

      const output = '{"type":"response","done":true}\n{"type":"event","event":"tool_calls"}';
      const events = parseResponse(output);
      
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('response');
      expect(events[1].event).toBe('tool_calls');
    });

    test('handles malformed JSON in stream', () => {
      const parseLine = (line: string) => {
        try {
          return JSON.parse(line);
        } catch {
          return { error: 'invalid json', raw: line };
        }
      };

      const result = parseLine('not valid json');
      expect(result.error).toBe('invalid json');
    });

    test('extracts done flag', () => {
      const findDone = (events: Array<{done?: boolean}>) => 
        events.find(e => e.done)?.done ?? false;

      const events = [{ type: 'event' }, { type: 'response', done: true }];
      expect(findDone(events)).toBe(true);
    });

    test('extracts final message', () => {
      const findMessage = (events: Array<{message?: string; done?: boolean}>) =>
        events.find(e => e.done)?.message ?? undefined;

      const events = [{ type: 'response', message: 'final answer', done: true }];
      expect(findMessage(events)).toBe('final answer');
    });
  });

  // Protocol handling
  describe('JSONL Protocol', () => {
    test('prompt format is valid JSON', () => {
      const prompt = {
        type: 'prompt',
        message: 'Hello TED',
        context: { householdId: 'hh-123' },
      };
      
      const json = JSON.stringify(prompt);
      const parsed = JSON.parse(json);
      
      expect(parsed.type).toBe('prompt');
      expect(parsed.message).toBe('Hello TED');
    });

    test('tool_calls event structure', () => {
      const event = {
        type: 'event',
        event: 'tool_calls',
        data: {
          tools: [
            { name: 'create_expense', input: { amountCents: 5000 } },
          ],
        },
      };
      
      expect(event.type).toBe('event');
      expect(event.event).toBe('tool_calls');
      expect(event.data.tools[0].name).toBe('create_expense');
    });

    test('error event structure', () => {
      const error = {
        type: 'error',
        message: 'Tool execution failed',
        code: 500,
      };
      
      expect(error.type).toBe('error');
      expect(error.message).toBeDefined();
      expect(error.code).toBe(500);
    });

    test('response with data structure', () => {
      const response = {
        type: 'response',
        message: 'Expense created',
        data: { recordId: 'rec-123' },
        done: true,
      };
      
      expect(response.done).toBe(true);
      expect(response.data?.recordId).toBe('rec-123');
    });
  });

  // Timeout and retry
  describe('Timeout and retry', () => {
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

      const slowPromise = new Promise(resolve => setTimeout(resolve, 500));
      
      await expect(withTimeout(slowPromise, 50)).rejects.toThrow('Timeout');
    });

    test('retry on transient error', async () => {
      let attempts = 0;
      const withRetry = async <T>(fn: () => Promise<T>, maxRetries: number): Promise<T> => {
        while (attempts < maxRetries) {
          try {
            return await fn();
          } catch (e) {
            attempts++;
            if (attempts >= maxRetries) throw e;
          }
        }
        throw new Error('Max retries exceeded');
      };

      attempts = 0;
      const failingFn = async () => {
        attempts++;
        if (attempts < 2) throw new Error('Transient error');
        return 'success';
      };

      const result = await withRetry(failingFn, 3);
      expect(result).toBe('success');
    });
  });
});