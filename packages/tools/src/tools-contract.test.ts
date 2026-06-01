// ─────────────────────────────────────────────────────────────────────────────
// Tools Contract Tests - Contract validation for Pi Tools
// Tests tool registry contracts and behaviors
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, beforeEach, vi } from 'vitest';
import { ToolRegistry, type ToolDefinition } from './tool-registry.js';
import { toolSuccess, toolFailure } from './tool-result.js';

// ─────────────────────────────────────────────────────────────────────────────
// A3.1: Tool inexistente retorna failure
// ─────────────────────────────────────────────────────────────────────────────

describe('Tools Contract - Non-existent Tool', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('A3.1: Executing non-existent tool returns failure', async () => {
    const result = await registry.execute('non-existent-tool', { test: 'data' });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('não encontrada');
    expect(result.reason).toContain('non-existent-tool');
  });

  test('A3.1b: Non-existent tool with context still returns failure', async () => {
    const result = await registry.execute('unknown-tool', { foo: 'bar' }, { householdId: 'hh-123' });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('não encontrada');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A3.2: Input inválido retorna failure com mensagem clara
// ─────────────────────────────────────────────────────────────────────────────

describe('Tools Contract - Invalid Input', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();

    // Register tool with required schema
    registry.register('test-tool', {
      inputSchema: {
        type: 'object',
        required: ['name', 'amount'],
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
        },
      },
      handler: async () => toolSuccess({ created: true }),
    });
  });

  test('A3.2: Missing required field returns failure', async () => {
    const result = await registry.execute('test-tool', { name: 'Test' }); // missing 'amount'

    expect(result.success).toBe(false);
    expect(result.reason).toContain('required');
    expect(result.reason).toContain('amount');
  });

  test('A3.2b: Null input returns failure', async () => {
    const result = await registry.execute('test-tool', null);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Input is required');
  });

  test('A3.2c: Invalid type returns failure with message', async () => {
    const result = await registry.execute('test-tool', { name: 'Test', amount: 'not-a-number' });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('number');
    expect(result.reason).toContain('amount');
  });

  test('A3.2d: Non-object input returns failure', async () => {
    const result = await registry.execute('test-tool', 'just a string' as any);

    expect(result.success).toBe(false);
    expect(result.reason).toContain('must be an object');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A3.3: Idempotência - mesma idempotencyKey retorna resultado cacheado
// ─────────────────────────────────────────────────────────────────────────────

describe('Tools Contract - Idempotency', () => {
  test('A3.3: Same idempotencyKey returns cached result', async () => {
    const registry = new ToolRegistry();
    let callCount = 0;

    registry.register('expensive-tool', {
      inputSchema: { type: 'object' },
      handler: async () => {
        callCount++;
        return toolSuccess({ call: callCount, timestamp: Date.now() });
      },
    });

    const key = 'idempotent-key-123';
    const context = { householdId: 'hh-1', idempotencyKey: key };

    // First call
    const result1 = await registry.execute('expensive-tool', { data: 'test' }, context);
    expect(result1.success).toBe(true);
    expect(callCount).toBe(1);

    // Second call with same key - should return cached
    const result2 = await registry.execute('expensive-tool', { data: 'different' }, context);
    expect(result2.success).toBe(true);
    expect(callCount).toBe(1); // Not incremented - cached

    // Verify results are identical
    expect(result2.data).toEqual(result1.data);
  });

  test('A3.3b: Different idempotencyKey calls handler each time', async () => {
    const registry = new ToolRegistry();
    let callCount = 0;

    registry.register('counter-tool', {
      inputSchema: { type: 'object' },
      handler: async () => {
        callCount++;
        return toolSuccess({ count: callCount });
      },
    });

    // First call
    const result1 = await registry.execute('counter-tool', {}, { idempotencyKey: 'key-1' });
    expect(callCount).toBe(1);

    // Second call with different key
    const result2 = await registry.execute('counter-tool', {}, { idempotencyKey: 'key-2' });
    expect(callCount).toBe(2);

    // Results should be different
    expect(result2.data).not.toEqual(result1.data);
  });

  test('A3.3c: No idempotencyKey means no caching', async () => {
    const registry = new ToolRegistry();
    let callCount = 0;

    registry.register('no-cache-tool', {
      inputSchema: { type: 'object' },
      handler: async () => {
        callCount++;
        return toolSuccess({ count: callCount });
      },
    });

    // Multiple calls without key
    await registry.execute('no-cache-tool', {});
    await registry.execute('no-cache-tool', {});
    await registry.execute('no-cache-tool', {});

    expect(callCount).toBe(3); // All calls executed
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A3.4: ToolRegistry.listTools() retorna todas as tools registradas
// ─────────────────────────────────────────────────────────────────────────────

describe('Tools Contract - List Tools', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('A3.4: listTools() returns all registered tool names', async () => {
    registry.register('tool-a', { inputSchema: {}, handler: async () => toolSuccess({}) });
    registry.register('tool-b', { inputSchema: {}, handler: async () => toolSuccess({}) });
    registry.register('tool-c', { inputSchema: {}, handler: async () => toolSuccess({}) });

    const tools = registry.listTools();

    expect(tools).toContain('tool-a');
    expect(tools).toContain('tool-b');
    expect(tools).toContain('tool-c');
    expect(tools).toHaveLength(3);
  });

  test('A3.4b: listTools() returns empty array when no tools registered', () => {
    const tools = registry.listTools();
    expect(tools).toEqual([]);
  });

  test('A3.4c: listTools() does not include unregistered tools', () => {
    registry.register('existing', { inputSchema: {}, handler: async () => toolSuccess({}) });

    const tools = registry.listTools();

    expect(tools).toHaveLength(1);
    expect(tools).not.toContain('non-existent');
  });

  test('A3.4d: listTools() returns tools in registration order', () => {
    for (let i = 0; i < 5; i++) {
      registry.register(`tool-${i}`, { inputSchema: {}, handler: async () => toolSuccess({}) });
    }

    const tools = registry.listTools();

    expect(tools).toEqual(['tool-0', 'tool-1', 'tool-2', 'tool-3', 'tool-4']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A3.5: Registrar e executar uma tool custom com sucesso
// ─────────────────────────────────────────────────────────────────────────────

describe('Tools Contract - Custom Tool Execution', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('A3.5: Can register and execute custom tool successfully', async () => {
    // Register custom tool
    registry.register('greet', {
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          greeting: { type: 'string' },
        },
      },
      handler: async (_, input: any) => {
        const greeting = input.greeting ?? 'Hello';
        return toolSuccess({ message: `${greeting}, ${input.name}!` });
      },
    });

    // Execute
    const result = await registry.execute('greet', { name: 'Alice', greeting: 'Hi' });

    expect(result.success).toBe(true);
    expect(result.data?.message).toBe('Hi, Alice!');
  });

  test('A3.5b: Custom tool with default parameters works', async () => {
    registry.register('calculate', {
      inputSchema: {
        type: 'object',
        required: ['a', 'b'],
        properties: {
          a: { type: 'number' },
          b: { type: 'number' },
          operation: { type: 'string' },
        },
      },
      handler: async (_, input: any) => {
        const op = input.operation ?? 'add';
        let result: number;
        switch (op) {
          case 'add':
            result = input.a + input.b;
            break;
          case 'subtract':
            result = input.a - input.b;
            break;
          default:
            return toolFailure(`Unknown operation: ${op}`);
        }
        return toolSuccess({ result });
      },
    });

    // With default operation
    const result1 = await registry.execute('calculate', { a: 10, b: 5 });
    expect(result1.success).toBe(true);
    expect(result1.data?.result).toBe(15);

    // With explicit operation
    const result2 = await registry.execute('calculate', { a: 10, b: 5, operation: 'subtract' });
    expect(result2.success).toBe(true);
    expect(result2.data?.result).toBe(5);
  });

  test('A3.5c: Custom tool with householdId context', async () => {
    registry.register('get-balance', {
      inputSchema: { type: 'object' },
      handler: async (ctx) => {
        return toolSuccess({
          householdId: ctx.householdId,
          balance: 1000,
        });
      },
    });

    const result = await registry.execute('get-balance', {}, { householdId: 'hh-custom-123' });

    expect(result.success).toBe(true);
    expect(result.data?.householdId).toBe('hh-custom-123');
  });

  test('A3.5d: Custom tool can throw and return failure', async () => {
    registry.register('failing-tool', {
      inputSchema: { type: 'object' },
      handler: async () => {
        throw new Error('Intentional failure');
      },
    });

    const result = await registry.execute('failing-tool', {});

    expect(result.success).toBe(false);
    expect(result.reason).toContain('Intentional failure');
  });

  test('A3.5e: Custom tool can return failure directly', async () => {
    registry.register('invalid-tool', {
      inputSchema: { type: 'object' },
      handler: async () => {
        return toolFailure('Business rule violation');
      },
    });

    const result = await registry.execute('invalid-tool', {});

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Business rule violation');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A3.6: Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Tools Contract - Edge Cases', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  test('A3.6: Overwriting existing tool works', async () => {
    registry.register('my-tool', {
      inputSchema: { type: 'object' },
      handler: async () => toolSuccess({ version: 1 }),
    });

    // Overwrite
    registry.register('my-tool', {
      inputSchema: { type: 'object' },
      handler: async () => toolSuccess({ version: 2 }),
    });

    const result = await registry.execute('my-tool', {});
    expect(result.data?.version).toBe(2);
  });

  test('A3.6b: Empty string tool name allowed', async () => {
    registry.register('', {
      inputSchema: { type: 'object' },
      handler: async () => toolSuccess({}),
    });

    const result = await registry.execute('', {});
    expect(result.success).toBe(true);
  });

  test('A3.6c: Tool with only optional fields works', async () => {
    registry.register('optional-tool', {
      inputSchema: {
        type: 'object',
        properties: {
          optionalField: { type: 'string' },
        },
      },
      handler: async () => toolSuccess({ ok: true }),
    });

    // Execute with no input (but must be object)
    const result = await registry.execute('optional-tool', {});
    expect(result.success).toBe(true);
  });

  test('A3.6d: Handler returning undefined causes undefined result', async () => {
    registry.register('no-return', {
      inputSchema: { type: 'object' },
      handler: async () => {
        // No return - implicit undefined
      },
    });

    const result = await registry.execute('no-return', {});
    // When handler returns undefined, result is undefined (not a ToolResult)
    // This is actual behavior - handlers should always return toolSuccess() or toolFailure()
    expect(result).toBeUndefined();
  });
});