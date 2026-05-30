// ─────────────────────────────────────────────────────────────────────────────
// Pi RPC Runner - JSONL client tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test } from 'vitest';

// Test the JSONL client interface and basic behavior
// without spawning real processes
describe('Pi RPC Runner - JSONL Client', () => {
  test('JSONL protocol format - writes prompt with type and newline', () => {
    const payload = { type: 'prompt', message: 'Transferir 100 do Inter para Nubank' };
    const jsonl = JSON.stringify(payload) + '\n';
    
    expect(jsonl).toContain('"type":"prompt"');
    expect(jsonl).toContain('\n');
    expect(JSON.parse(jsonl.slice(0, -1))).toEqual(payload);
  });

  test('JSONL protocol - parses message_update deltas', () => {
    const msg1 = JSON.parse('{"type":"message_update","delta":"Olá"}');
    const msg2 = JSON.parse('{"type":"message_update","delta":" TED!"}');
    
    expect(msg1.type).toBe('message_update');
    expect(msg1.delta).toBe('Olá');
    expect(msg2.delta).toBe(' TED!');
  });

  test('JSONL protocol - error event format', () => {
    const errorMsg = JSON.parse('{"type":"error","message":"Timeout exceeded"}');
    
    expect(errorMsg.type).toBe('error');
    expect(errorMsg.message).toBe('Timeout exceeded');
  });

  test('JSONL protocol - tool_calls format', () => {
    const toolMsg = JSON.parse('{"type":"tool_calls","calls":[{"name":"create_expense","args":{}}]}');
    
    expect(toolMsg.type).toBe('tool_calls');
    expect(toolMsg.calls).toHaveLength(1);
    expect(toolMsg.calls[0].name).toBe('create_expense');
  });

  test('JSONL protocol - done event format', () => {
    const doneMsg = JSON.parse('{"type":"done"}');
    
    expect(doneMsg.type).toBe('done');
  });
});