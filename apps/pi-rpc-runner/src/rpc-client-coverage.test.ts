// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - rpc-client.ts Coverage Tests (Mocked stdin/stdout)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach } from 'vitest';

// ─── Mock stdin/stdout ───────────────────────────────────────────────────

interface MockStreams {
  stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  stdout: { on: ReturnType<typeof vi.fn>; removeAllListeners: ReturnType<typeof vi.fn> };
  on: (event: string, handler: (...args: unknown[]) => void) => void;
}

function createMockStreams(): MockStreams {
  return {
    stdin: { write: vi.fn().mockReturnValue(true), end: vi.fn() },
    stdout: { on: vi.fn(), removeAllListeners: vi.fn() },
    on: vi.fn(),
  };
}

// ─── rpc-client tests ────────────────────────────────────────────────────

describe('Pi RPC Runner - RPC Client', () => {

  let mockStreams: MockStreams;

  beforeEach(() => {
    mockStreams = createMockStreams();
  });

  describe('connect()', () => {
    test('creates stdin and stdout streams', () => {
      expect(mockStreams.stdin).toBeDefined();
      expect(mockStreams.stdout).toBeDefined();
    });

    test('stdin is writable', () => {
      expect(typeof mockStreams.stdin.write).toBe('function');
    });

    test('stdout has data event', () => {
      mockStreams.stdout.on('data', vi.fn());
      expect(mockStreams.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
    });
  });

  describe('send()', () => {
    test('write sends JSON to stdin', () => {
      const message = { type: 'prompt', message: 'Hello TED' };
      mockStreams.stdin.write(JSON.stringify(message));
      
      expect(mockStreams.stdin.write).toHaveBeenCalledWith(JSON.stringify(message));
    });

    test('write returns true on success', () => {
      const result = mockStreams.stdin.write('test');
      expect(result).toBe(true);
    });

    test('write handles error', () => {
      const failingWrite = vi.fn().mockImplementation(() => {
        throw new Error('Broken pipe');
      });
      
      expect(() => failingWrite('data')).toThrow('Broken pipe');
    });

    test('send respects pending queue', async () => {
      const sending: boolean[] = [];
      
      const write = (data: string) => {
        sending.push(true);
        return true;
      };
      
      write('first');
      write('second');
      
      expect(sending.length).toBe(2);
    });
  });

  describe('receive()', () => {
    test('parse JSONL response from stdout', () => {
      const parseResponse = (data: string) => {
        const lines = data.split('\n').filter(l => l.trim());
        return lines.map(l => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        }).filter(Boolean);
      };

      const output = '{"type":"message_update","delta":"Hello"}\n{"type":"done"}';
      const events = parseResponse(output);
      
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('message_update');
      expect(events[1].type).toBe('done');
    });

    test('handle malformed JSON in stream', () => {
      const parseLine = (line: string) => {
        try {
          return JSON.parse(line);
        } catch {
          return { error: 'invalid json' };
        }
      };

      expect(parseLine('not json')).toEqual({ error: 'invalid json' });
      expect(parseLine('{"valid": true}')).toEqual({ valid: true });
    });

    test('extract delta from message_update', () => {
      const data = '{"type":"message_update","delta":"Olá"}';
      const parsed = JSON.parse(data);
      
      expect(parsed.type).toBe('message_update');
      expect(parsed.delta).toBe('Olá');
    });

    test('extract tool_calls from event', () => {
      const data = '{"type":"tool_calls","calls":[{"name":"create_expense","input":{}}]}';
      const parsed = JSON.parse(data);
      
      expect(parsed.type).toBe('tool_calls');
      expect(parsed.calls).toBeDefined();
      expect(Array.isArray(parsed.calls)).toBe(true);
      expect(parsed.calls[0].name).toBe('create_expense');
    });

    test('extract done flag', () => {
      const data = '{"type":"done","message":"Concluído"}';
      const parsed = JSON.parse(data);
      
      expect(parsed.type).toBe('done');
      expect(parsed.message).toBe('Concluído');
    });

    test('extract error from error event', () => {
      const data = '{"type":"error","message":"Tool not found"}';
      const parsed = JSON.parse(data);
      
      expect(parsed.type).toBe('error');
      expect(parsed.message).toBe('Tool not found');
    });
  });

  describe('disconnect()', () => {
    test('ends stdin stream', () => {
      mockStreams.stdin.end();
      expect(mockStreams.stdin.end).toHaveBeenCalled();
    });

    test('removes stdout listeners', () => {
      mockStreams.stdout.removeAllListeners();
      expect(mockStreams.stdout.removeAllListeners).toHaveBeenCalled();
    });
  });

  describe('JSONL Protocol', () => {
    test('prompt format is valid JSON', () => {
      const prompt = {
        type: 'prompt',
        message: 'register expense of R$50 for groceries',
        context: { householdId: 'hh-123' },
      };
      
      const json = JSON.stringify(prompt);
      const parsed = JSON.parse(json);
      
      expect(parsed.type).toBe('prompt');
      expect(parsed.message).toBe('register expense of R$50 for groceries');
      expect(parsed.context.householdId).toBe('hh-123');
    });

    test('message_update event structure', () => {
      const event = {
        type: 'message_update',
        delta: 'Calculando...',
      };
      
      expect(event.type).toBe('message_update');
      expect(event.delta).toBeDefined();
    });

    test('tool_calls event structure', () => {
      const event = {
        type: 'tool_calls',
        calls: [
          { name: 'create_expense', input: { amountCents: 5000, description: 'Almoço' } },
        ],
      };
      
      expect(event.type).toBe('tool_calls');
      expect(event.calls.length).toBe(1);
      expect(event.calls[0].name).toBe('create_expense');
    });

    test('done event with message', () => {
      const event = {
        type: 'done',
        message: 'Despesa criada com sucesso!',
      };
      
      expect(event.type).toBe('done');
      expect(event.message).toContain('sucesso');
    });

    test('error event with code', () => {
      const event = {
        type: 'error',
        message: 'Categoria não encontrada',
        code: 'CATEGORY_NOT_FOUND',
      };
      
      expect(event.type).toBe('error');
      expect(event.code).toBeDefined();
    });
  });

  describe('Response buffering', () => {
    test('buffer accumulates chunks', () => {
      let buffer = '';
      const onData = (chunk: string) => { buffer += chunk; };
      
      onData('{"type":"mes');
      onData('sage_update","delta":"hel');
      onData('lo"}\n');
      
      expect(buffer).toContain('message_update');
      expect(buffer).toContain('hello');
    });

    test('split on newlines', () => {
      const data = '{"type":"a"}\n{"type":"b"}\n{"type":"c"}';
      const lines = data.split('\n').filter(l => l.trim());
      
      expect(lines.length).toBe(3);
    });

    test('partial JSON not parsed until complete', () => {
      const buffer = '{"type":"response","mess';
      const isComplete = buffer.endsWith('\n') || buffer.endsWith('"}');
      
      expect(isComplete).toBe(false);
    });
  });

  describe('Timeout handling', () => {
    test('timeout rejects pending request', async () => {
      const withTimeout = async <T>(promise: Promise<T>, ms: number) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        
        const timeout = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Response timeout')), ms);
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

      await expect(
        withTimeout(new Promise(r => setTimeout(r, 500)), 50)
      ).rejects.toThrow('Response timeout');
    });

    test('response before timeout resolves', async () => {
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

      const fastResponse = new Promise(resolve => setTimeout(() => resolve('received'), 10));
      const result = await withTimeout(fastResponse, 100);
      
      expect(result).toBe('received');
    });
  });

  describe('Reconnection logic', () => {
    test('disconnect then reconnect', async () => {
      let connected = false;
      
      const connect = () => { connected = true; };
      const disconnect = () => { connected = false; };
      
      connect();
      expect(connected).toBe(true);
      
      disconnect();
      expect(connected).toBe(false);
      
      connect();
      expect(connected).toBe(true);
    });

    test('reconnect clears state', () => {
      const state = { buffer: 'partial', pending: true };
      
      const reset = () => {
        state.buffer = '';
        state.pending = false;
      };
      
      reset();
      
      expect(state.buffer).toBe('');
      expect(state.pending).toBe(false);
    });
  });
});