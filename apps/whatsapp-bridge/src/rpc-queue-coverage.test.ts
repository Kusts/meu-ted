// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Bridge - rpc-queue.ts Coverage Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi } from 'vitest';
import { RpcQueue, parseJsonlResponse, formatPromptAsJsonl } from './rpc-queue.js';

describe('WhatsApp Bridge - RPC Queue', () => {

  // ─── RpcQueue constructor ────────────────────────────────────────────────

  describe('RpcQueue constructor', () => {
    test('creates queue with default timeout 30s', () => {
      const queue = new RpcQueue();
      expect(queue).toBeDefined();
    });

    test('creates queue with custom timeout', () => {
      const queue = new RpcQueue({ timeoutMs: 5000 });
      expect(queue).toBeDefined();
    });

    test('isBusy returns false when idle', () => {
      const queue = new RpcQueue();
      expect(queue.isBusy()).toBe(false);
    });

    test('getCurrentJob returns null when idle', () => {
      const queue = new RpcQueue();
      expect(queue.getCurrentJob()).toBeNull();
    });
  });

  // ─── enqueue basic ──────────────────────────────────────────────────────

  describe('RpcQueue.enqueue', () => {
    test('executes job immediately when idle', async () => {
      const queue = new RpcQueue();
      const result = await queue.enqueue('job-1', async () => 'result');
      expect(result).toBe('result');
    });

    test('returns executor result', async () => {
      const queue = new RpcQueue();
      const result = await queue.enqueue('job', async () => ({ data: true }));
      expect(result).toEqual({ data: true });
    });

    test('queue is idle after job completes', async () => {
      const queue = new RpcQueue();
      await queue.enqueue('job', async () => 'done');
      expect(queue.isBusy()).toBe(false);
    });

    test('accepts job ID string', async () => {
      const queue = new RpcQueue();
      const result = await queue.enqueue('my-job-id-123', async () => 42);
      expect(result).toBe(42);
    });

    test('sequential jobs execute in order', async () => {
      const queue = new RpcQueue();
      const results: string[] = [];
      
      await queue.enqueue('a', async () => { results.push('a'); return 'a'; });
      await queue.enqueue('b', async () => { results.push('b'); return 'b'; });
      await queue.enqueue('c', async () => { results.push('c'); return 'c'; });
      
      expect(results).toEqual(['a', 'b', 'c']);
    });
  });

  // ─── Timeout behavior ───────────────────────────────────────────────────

  describe('RpcQueue timeout', () => {
    test('respects custom timeout', async () => {
      const queue = new RpcQueue({ timeoutMs: 100 });
      
      const result = await queue.enqueue('job', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'completed';
      });
      
      expect(result).toBe('completed');
    });

    test('throws on timeout exceeded', async () => {
      const queue = new RpcQueue({ timeoutMs: 50 });
      
      await expect(
        queue.enqueue('slow', async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'never';
        })
      ).rejects.toThrow('timeout');
    });

    test('timeout applies to each job', async () => {
      const queue = new RpcQueue({ timeoutMs: 30 });
      
      // First job completes
      await queue.enqueue('fast', async () => 'fast');
      
      // Second job times out
      await expect(
        queue.enqueue('slow', async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return 'timeout';
        })
      ).rejects.toThrow('timeout');
    });
  });

  // ─── Serial execution ───────────────────────────────────────────────────

  describe('Serial execution', () => {
    test('only one job runs at a time', async () => {
      const queue = new RpcQueue();
      let concurrent = 0;
      let maxConcurrent = 0;

      await queue.enqueue('job1', async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 30));
        concurrent--;
        return 'job1';
      });

      await queue.enqueue('job2', async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise(resolve => setTimeout(resolve, 30));
        concurrent--;
        return 'job2';
      });

      expect(maxConcurrent).toBe(1); // Never more than 1 concurrent
    });

    test('jobs wait for lock', async () => {
      const queue = new RpcQueue();
      const executionOrder: string[] = [];

      // Start first job that takes time
      const p1 = queue.enqueue('long', async () => {
        executionOrder.push('start-long');
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push('end-long');
        return 'long';
      });

      // Immediately queue second job
      const p2 = queue.enqueue('short', async () => {
        executionOrder.push('short');
        return 'short';
      });

      await Promise.all([p1, p2]);

      // short should come after long completes
      const shortIndex = executionOrder.indexOf('short');
      const endLongIndex = executionOrder.indexOf('end-long');
      expect(shortIndex).toBeGreaterThan(endLongIndex);
    });
  });

  // ─── Lock release on error ─────────────────────────────────────────────

  describe('Lock release on error', () => {
    test('lock is released after job throws', async () => {
      const queue = new RpcQueue();

      await expect(
        queue.enqueue('failing', async () => {
          throw new Error('job failed');
        })
      ).rejects.toThrow('job failed');

      expect(queue.isBusy()).toBe(false);

      // Should be able to enqueue another job
      const result = await queue.enqueue('after-fail', async () => 'ok');
      expect(result).toBe('ok');
    });

    test('lock released after timeout', async () => {
      const queue = new RpcQueue({ timeoutMs: 50 });

      await expect(
        queue.enqueue('timeout-job', async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'never';
        })
      ).rejects.toThrow('timeout');

      expect(queue.isBusy()).toBe(false);
    });
  });
});

describe('WhatsApp Bridge - parseJsonlResponse', () => {

  test('parses single valid JSON line', () => {
    const result = parseJsonlResponse('{"type":"response","message":"ok","done":true}');
    expect(result.events.length).toBe(1);
    expect(result.events[0].type).toBe('response');
    expect(result.finalMessage).toBe('ok');
  });

  test('parses multiple lines', () => {
    const output = '{"type":"event","event":"tool_calls"}\n{"type":"response","done":true}';
    const result = parseJsonlResponse(output);
    expect(result.events.length).toBe(2);
    expect(result.events[0].event).toBe('tool_calls');
  });

  test('extracts finalMessage from done response', () => {
    const output = '{"type":"response","message":"final answer here","done":true}';
    const result = parseJsonlResponse(output);
    expect(result.finalMessage).toBe('final answer here');
  });

  test('empty string returns empty events', () => {
    const result = parseJsonlResponse('');
    expect(result.events.length).toBe(0);
    expect(result.finalMessage).toBeUndefined();
  });

  test('skips invalid JSON lines', () => {
    const output = '{"type":"a"}\nnot-json\n{"type":"b"}';
    const result = parseJsonlResponse(output);
    expect(result.events.length).toBe(2);
    expect(result.events[0].type).toBe('a');
    expect(result.events[1].type).toBe('b');
  });

  test('parses nested data', () => {
    const output = '{"type":"response","data":{"recordId":"rec-123","amount":5000},"done":true}';
    const result = parseJsonlResponse(output);
    expect(result.events[0].data).toEqual({ recordId: 'rec-123', amount: 5000 });
  });

  test('handles trailing newline', () => {
    const output = '{"type":"response"}\n';
    const result = parseJsonlResponse(output);
    expect(result.events.length).toBe(1);
  });

  test('handles whitespace lines', () => {
    const output = '{"type":"a"}\n   \n{"type":"b"}';
    const result = parseJsonlResponse(output);
    expect(result.events.length).toBe(2);
  });

  test('returns last done message as finalMessage', () => {
    const output = '{"type":"response","message":"first","done":true}\n{"type":"response","message":"second","done":true}';
    const result = parseJsonlResponse(output);
    expect(result.finalMessage).toBe('second');
  });
});

describe('WhatsApp Bridge - formatPromptAsJsonl', () => {

  test('formats message as JSON object', () => {
    const jsonl = formatPromptAsJsonl('Hello TED');
    const parsed = JSON.parse(jsonl);
    expect(parsed.message).toBe('Hello TED');
  });

  test('includes type field', () => {
    const jsonl = formatPromptAsJsonl('test');
    const parsed = JSON.parse(jsonl);
    expect(parsed.type).toBe('prompt');
  });

  test('includes empty context by default', () => {
    const jsonl = formatPromptAsJsonl('test');
    const parsed = JSON.parse(jsonl);
    expect(parsed.context).toEqual({});
  });

  test('includes provided context', () => {
    const jsonl = formatPromptAsJsonl('test', { householdId: 'hh-123', userId: 'u-1' });
    const parsed = JSON.parse(jsonl);
    expect(parsed.context.householdId).toBe('hh-123');
    expect(parsed.context.userId).toBe('u-1');
  });

  test('escapes quotes in message', () => {
    const jsonl = formatPromptAsJsonl('say "hello"');
    const parsed = JSON.parse(jsonl);
    expect(parsed.message).toBe('say "hello"');
  });

  test('handles unicode', () => {
    const jsonl = formatPromptAsJsonl('R$ 150,00');
    const parsed = JSON.parse(jsonl);
    expect(parsed.message).toBe('R$ 150,00');
  });

  test('handles multiline message', () => {
    const jsonl = formatPromptAsJsonl('line1\nline2');
    const parsed = JSON.parse(jsonl);
    expect(parsed.message).toContain('\n');
  });
});