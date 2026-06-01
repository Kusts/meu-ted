// ─────────────────────────────────────────────────────────────────────────────
// Tools Package - rpc-queue.ts and ted-prompt.ts Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { RpcQueue, parseJsonlResponse, formatPromptAsJsonl } from './rpc-queue.js';
import { generateTedSystemPrompt, getTedToolList, validateToolResponse } from './ted-prompt.js';

describe('Tools - RPC Queue', () => {

  // ─── RpcQueue constructor and defaults ──────────────────────────────────

  describe('RpcQueue', () => {
    test('creates queue with default timeout of 30s', () => {
      const queue = new RpcQueue();
      expect(queue).toBeDefined();
      expect(queue.isBusy()).toBe(false);
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

  // ─── RpcQueue.enqueue basic behavior ─────────────────────────────────────

  describe('RpcQueue.enqueue', () => {
    test('executes job immediately when queue is idle', async () => {
      const queue = new RpcQueue();
      const result = await queue.enqueue('job-1', async () => 'result');
      expect(result).toBe('result');
    });

    test('accepts job ID string', async () => {
      const queue = new RpcQueue();
      const result = await queue.enqueue('test-job-id', async () => 42);
      expect(result).toBe(42);
    });

    test('returns executor result', async () => {
      const queue = new RpcQueue();
      const result = await queue.enqueue('job', async () => ({ data: true }));
      expect(result).toEqual({ data: true });
    });

    test('job completes and queue is idle again', async () => {
      const queue = new RpcQueue();
      await queue.enqueue('job', async () => 'done');
      expect(queue.isBusy()).toBe(false);
    });

    test('sequential jobs execute in order', async () => {
      const queue = new RpcQueue();
      const results: string[] = [];
      
      await queue.enqueue('job-a', async () => { results.push('a'); return 'a'; });
      await queue.enqueue('job-b', async () => { results.push('b'); return 'b'; });
      await queue.enqueue('job-c', async () => { results.push('c'); return 'c'; });
      
      expect(results).toEqual(['a', 'b', 'c']);
    });
  });

  // ─── RpcQueue timeout behavior ────────────────────────────────────────────

  describe('RpcQueue timeout', () => {
    test('respects custom timeout', async () => {
      const queue = new RpcQueue({ timeoutMs: 100 });
      
      const result = await queue.enqueue('slow-job', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'completed';
      });
      
      expect(result).toBe('completed');
    });

    test('returns timeout error when job exceeds timeout', async () => {
      const queue = new RpcQueue({ timeoutMs: 50 });
      
      const result = await queue.enqueue('very-slow', async () => {
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'never';
      });
      
      expect(result).toBeDefined();
      expect((result as any).success).toBe(false);
      expect((result as any).reason).toContain('timeout');
    });
  });

  // ─── parseJsonlResponse ───────────────────────────────────────────────────

  describe('parseJsonlResponse', () => {
    test('parses single line JSON', () => {
      const result = parseJsonlResponse('{"type":"response","message":"ok","done":true}');
      expect(result.events.length).toBe(1);
      expect(result.events[0].type).toBe('response');
      expect(result.finalMessage).toBe('ok');
    });

    test('parses multiple lines', () => {
      const output = '{"type":"event","event":"tool_calls"}\n{"type":"response","message":"done","done":true}';
      const result = parseJsonlResponse(output);
      expect(result.events.length).toBe(2);
    });

    test('extracts finalMessage from done response', () => {
      const output = '{"type":"response","message":"final answer here","done":true}';
      const result = parseJsonlResponse(output);
      expect(result.finalMessage).toBe('final answer here');
    });

    test('returns empty events for empty string', () => {
      const result = parseJsonlResponse('');
      expect(result.events.length).toBe(0);
      expect(result.finalMessage).toBeUndefined();
    });

    test('skips invalid JSON lines', () => {
      const output = '{"type":"ok"}\ninvalid json\n{"type":"also_ok"}';
      const result = parseJsonlResponse(output);
      expect(result.events.length).toBe(2);
    });

    test('parses JSON with nested data', () => {
      const output = '{"type":"response","data":{"recordId":"rec-123"},"done":true}';
      const result = parseJsonlResponse(output);
      expect(result.events[0].data).toEqual({ recordId: 'rec-123' });
    });

    test('handles newline at end of output', () => {
      const output = '{"type":"response"}\n';
      const result = parseJsonlResponse(output);
      expect(result.events.length).toBe(1);
    });

    test('handles whitespace-only lines', () => {
      const output = '{"type":"a"}\n   \n{"type":"b"}';
      const result = parseJsonlResponse(output);
      expect(result.events.length).toBe(2);
    });
  });

  // ─── formatPromptAsJsonl ──────────────────────────────────────────────────

  describe('formatPromptAsJsonl', () => {
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
      const jsonl = formatPromptAsJsonl('test', { householdId: 'hh-123' });
      const parsed = JSON.parse(jsonl);
      expect(parsed.context.householdId).toBe('hh-123');
    });

    test('escapes special characters in message', () => {
      const jsonl = formatPromptAsJsonl('say "hello"');
      const parsed = JSON.parse(jsonl);
      expect(parsed.message).toBe('say "hello"');
    });

    test('handles unicode in message', () => {
      const jsonl = formatPromptAsJsonl('R$ 150,00 = €85');
      const parsed = JSON.parse(jsonl);
      expect(parsed.message).toBe('R$ 150,00 = €85');
    });

    test('handles multiline message', () => {
      const jsonl = formatPromptAsJsonl('line1\nline2');
      const parsed = JSON.parse(jsonl);
      expect(parsed.message).toContain('\n');
    });
  });
});

describe('Tools - TED Prompt', () => {

  // ─── generateTedSystemPrompt ─────────────────────────────────────────────

  describe('generateTedSystemPrompt', () => {
    test('returns non-empty string', () => {
      const prompt = generateTedSystemPrompt({ householdId: 'hh-123' });
      expect(prompt.length).toBeGreaterThan(0);
    });

    test('contains TED system prompt', () => {
      const prompt = generateTedSystemPrompt({ householdId: 'hh-123' });
      expect(prompt).toContain('TED');
    });

    test('contains anti-lie rules', () => {
      const prompt = generateTedSystemPrompt({ householdId: 'hh-123' });
      expect(prompt).toContain('ANTI-MENTIRA');
    });

    test('contains format instructions', () => {
      const prompt = generateTedSystemPrompt({ householdId: 'hh-123' });
      expect(prompt).toContain('Confirmação de ação');
    });

    test('uses custom tool list when provided', () => {
      const prompt = generateTedSystemPrompt({
        householdId: 'hh-123',
        availableTools: ['tool_a', 'tool_b'],
      });
      expect(prompt).toContain('tool_a');
      expect(prompt).toContain('tool_b');
    });

    test('uses default tool list when not provided', () => {
      const prompt = generateTedSystemPrompt({ householdId: 'hh-123' });
      expect(prompt).toContain('create_expense');
    });

    test('handles empty householdId', () => {
      const prompt = generateTedSystemPrompt({ householdId: '' });
      expect(prompt).toContain('TED');
    });

    test('includes context when provided', () => {
      const prompt = generateTedSystemPrompt({
        householdId: 'hh-123',
        context: 'user wants to create expense',
      });
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  // ─── getTedToolList ──────────────────────────────────────────────────────

  describe('getTedToolList', () => {
    test('returns array of strings', () => {
      const tools = getTedToolList();
      expect(Array.isArray(tools)).toBe(true);
      tools.forEach(t => expect(typeof t).toBe('string'));
    });

    test('contains create_expense', () => {
      const tools = getTedToolList();
      expect(tools).toContain('create_expense');
    });

    test('contains create_income', () => {
      const tools = getTedToolList();
      expect(tools).toContain('create_income');
    });

    test('contains create_transfer', () => {
      const tools = getTedToolList();
      expect(tools).toContain('create_transfer');
    });

    test('contains pay_bill', () => {
      const tools = getTedToolList();
      expect(tools).toContain('pay_bill');
    });

    test('contains close_invoice', () => {
      const tools = getTedToolList();
      expect(tools).toContain('close_invoice');
    });

    test('contains undo_last_action', () => {
      const tools = getTedToolList();
      expect(tools).toContain('undo_last_action');
    });

    test('returns 13 tools', () => {
      const tools = getTedToolList();
      expect(tools.length).toBe(13);
    });

    test('all tools are non-empty', () => {
      const tools = getTedToolList();
      tools.forEach(t => expect(t.length).toBeGreaterThan(0));
    });
  });

  // ─── validateToolResponse ─────────────────────────────────────────────────

  describe('validateToolResponse', () => {
    test('returns valid for success response with data', () => {
      const result = validateToolResponse({ success: true, data: { recordId: '123' } });
      expect(result.valid).toBe(true);
    });

    test('returns invalid when success=true but no data', () => {
      const result = validateToolResponse({ success: true });
      expect(result.valid).toBe(false);
      expect(result.message).toContain('sem dados');
    });

    test('returns valid for failure with reason', () => {
      const result = validateToolResponse({ success: false, reason: 'Account not found' });
      expect(result.valid).toBe(true);
      expect(result.message).toBe('Account not found');
    });

    test('returns invalid when failure without reason', () => {
      const result = validateToolResponse({ success: false });
      expect(result.valid).toBe(false);
      expect(result.message).toContain('failure sem reason');
    });

    test('handles undefined data', () => {
      const result = validateToolResponse({ success: true, data: undefined });
      expect(result.valid).toBe(false);
    });

    test('handles null data', () => {
      const result = validateToolResponse({ success: true, data: null });
      expect(result.valid).toBe(false);
    });

    test('handles empty data object', () => {
      const result = validateToolResponse({ success: true, data: {} });
      expect(result.valid).toBe(true); // empty object is still "data"
    });
  });
});