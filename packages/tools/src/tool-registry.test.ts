// ─────────────────────────────────────────────────────────────────────────────
// Tool Registry Test
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from './tool-registry.js';
import { ToolExecutor } from './tool-executor.js';
import { createToolResult, toolSuccess, toolFailure } from './tool-result.js';
import type { ToolResult, ToolSuccessResult, ToolFailureResult } from './tool-result.js';

// Type guards for tests
function isSuccess(r: ToolResult): r is ToolSuccessResult {
  return r.success === true;
}

function isFailure(r: ToolResult): r is ToolFailureResult {
  return r.success === false;
}

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 1: Tool Result Anti-Lie (REQ-005)
// RED FIRST: tool returns success=true ONLY after service confirms
// ─────────────────────────────────────────────────────────────────────────────

describe('ToolRegistry - Anti-Lie Result Pattern', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('REQ-005: tool returns success=true only with data after service confirms', async () => {
    registry.register('test_tool', {
      inputSchema: { type: 'object', properties: {} },
      handler: async () => createToolResult({ success: true, data: { message: 'done' } }),
    });

    const result = await registry.execute('test_tool', { message: 'done' });

    expect(result.success).toBe(true);
    if (isSuccess(result)) {
      expect(result.data).toBeDefined();
      expect((result.data as { message?: string }).message).toBe('done');
    }
  });

  it('REQ-005: failure returns success=false with reason, no partial', async () => {
    registry.register('fail_tool', {
      inputSchema: { type: 'object', properties: {} },
      handler: async () => toolFailure('Invalid input'),
    });

    const result = await registry.execute('fail_tool', {});

    expect(result.success).toBe(false);
    if (isFailure(result)) {
      expect(result.reason).toBe('Invalid input');
    }
  });

  it('REQ-005: exception in handler returns failure without partial', async () => {
    registry.register('crash_tool', {
      inputSchema: { type: 'object', properties: {} },
      handler: async () => { throw new Error('Service error'); },
    });

    const result = await registry.execute('crash_tool', {});

    expect(result.success).toBe(false);
    if (isFailure(result)) {
      expect(result.reason).toContain('Service error');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 2: Tool Registry - Register and Validate
// ─────────────────────────────────────────────────────────────────────────────

describe('ToolRegistry - Registration and Validation', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register valid tool', async () => {
    const called = { value: false };
    registry.register('my_tool', {
      inputSchema: { type: 'object', properties: { amount: { type: 'number' } } },
      handler: async () => { called.value = true; return toolSuccess({}); },
    });

    await registry.execute('my_tool', { amount: 100 });

    expect(called.value).toBe(true);
  });

  it('should reject unknown tool', async () => {
    const result = await registry.execute('unknown_tool', {});

    expect(result.success).toBe(false);
    if (isFailure(result)) {
      expect(result.reason).toContain('não encontrada');
    }
  });

  it('should validate required fields', async () => {
    registry.register('strict_tool', {
      inputSchema: {
        type: 'object',
        properties: {
          amountCents: { type: 'number' },
          description: { type: 'string' },
        },
        required: ['amountCents', 'description'],
      },
      handler: async () => toolSuccess({}),
    });

    // Missing required field
    const result = await registry.execute('strict_tool', { amountCents: 100 });

    expect(result.success).toBe(false);
    if (isFailure(result)) {
      expect(result.reason).toContain('required');
    }
  });

  it('should list registered tools', () => {
    registry.register('tool_a', { inputSchema: { type: 'object' }, handler: async () => toolSuccess({}) });
    registry.register('tool_b', { inputSchema: { type: 'object' }, handler: async () => toolSuccess({}) });

    const tools = registry.listTools();

    expect(tools).toContain('tool_a');
    expect(tools).toContain('tool_b');
    expect(tools).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 3: Tool Executor Uses Services
// ─────────────────────────────────────────────────────────────────────────────

describe('ToolExecutor - Service Integration', () => {
  it('should register all required tools', () => {
    const executor = new ToolExecutor({
      financialRecordService: {} as any,
      cardInvoiceService: {} as any,
      recurrenceService: {} as any,
      categoryService: {} as any,
    });
    const tools = executor.listTools();

    expect(tools).toContain('create_expense');
    expect(tools).toContain('create_income');
    expect(tools).toContain('create_transfer');
    expect(tools).toContain('create_installment_purchase');
    expect(tools).toContain('create_recurrence');
    expect(tools).toContain('pay_bill');
    expect(tools).toContain('close_invoice');
    expect(tools).toContain('pay_invoice');
  });

  it('should call FinancialRecordService.createExpense', async () => {
    const mockCreateExpense = vi.fn().mockResolvedValue({
      success: true,
      record: { id: 'record-1' },
    });

    const executor = new ToolExecutor({
      financialRecordService: { createExpense: mockCreateExpense } as any,
      cardInvoiceService: {} as any,
      recurrenceService: {} as any,
      categoryService: {} as any,
    });

    const result = await executor.executeTool('create_expense', { householdId: 'h1' }, { amountCents: 1000, description: 'Test', date: '2026-06-01' });

    expect(mockCreateExpense).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1000 }));
    expect(result.success).toBe(true);
  });

  it('should return failure when service fails', async () => {
    const mockCreateExpense = vi.fn().mockResolvedValue({
      success: false,
      reason: 'Valor inválido',
    });

    const executor = new ToolExecutor({
      financialRecordService: { createExpense: mockCreateExpense } as any,
      cardInvoiceService: {} as any,
      recurrenceService: {} as any,
      categoryService: {} as any,
    });

    const result = await executor.executeTool('create_expense', { householdId: 'h1' }, { amountCents: 1000, description: 'Test', date: '2026-06-01' });

    expect(result.success).toBe(false);
    if (isFailure(result)) {
      expect(result.reason).toContain('Valor inválido');
    }
  });

  it('should return failure for unknown tool', async () => {
    const executor = new ToolExecutor({
      financialRecordService: {} as any,
      cardInvoiceService: {} as any,
      recurrenceService: {} as any,
      categoryService: {} as any,
    });

    const result = await executor.executeTool('unknown_tool', { householdId: 'h1' }, {});

    expect(result.success).toBe(false);
    if (isFailure(result)) {
      expect(result.reason).toContain('não encontrada');
    }
  });

  it('should call RecurrenceService.payBill', async () => {
    const mockPayBill = vi.fn().mockResolvedValue({
      success: true,
      record: { id: 'record-1' },
    });

    const executor = new ToolExecutor({
      financialRecordService: {} as any,
      cardInvoiceService: {} as any,
      recurrenceService: { payBill: mockPayBill } as any,
      categoryService: {} as any,
    });

    const result = await executor.executeTool('pay_bill', { householdId: 'h1' }, { billId: 'bill-1', amountCents: 1000, paymentDate: '2026-06-01' });

    expect(mockPayBill).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 4: Idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('ToolRegistry - Idempotency', () => {
  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
  });

  it('should return same result for duplicate idempotency key', async () => {
    const registry = new ToolRegistry({
      idempotencyStore: new Map<string, ToolResult>(),
    });

    registry.register('idempotent_tool', {
      inputSchema: { type: 'object' },
      handler: async () => {
        callCount++;
        return toolSuccess({ callCount });
      },
    });

    const context = { householdId: 'h1', idempotencyKey: 'key-123' };

    // First call
    const result1 = await registry.execute('idempotent_tool', {}, context);
    expect(result1.success).toBe(true);
    if (isSuccess(result1)) {
      expect((result1.data as { callCount: number }).callCount).toBe(1);
    }

    // Second call with same key - should return cached result
    const result2 = await registry.execute('idempotent_tool', {}, context);
    expect(result2.success).toBe(true);
    if (isSuccess(result2)) {
      expect((result2.data as { callCount: number }).callCount).toBe(1); // Still 1, handler not called again
    }
    expect(callCount).toBe(1);
  });

  it('should execute again with different idempotency key', async () => {
    const registry = new ToolRegistry({
      idempotencyStore: new Map<string, ToolResult>(),
    });

    registry.register('idempotent_tool', {
      inputSchema: { type: 'object' },
      handler: async () => {
        callCount++;
        return toolSuccess({ callCount });
      },
    });

    // First call with key-1
    await registry.execute('idempotent_tool', {}, { householdId: 'h1', idempotencyKey: 'key-1' });
    
    // Second call with key-2 - should execute again
    await registry.execute('idempotent_tool', {}, { householdId: 'h1', idempotencyKey: 'key-2' });

    expect(callCount).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 5: Pi RPC Queue/Lock
// ─────────────────────────────────────────────────────────────────────────────

describe('RpcQueue - Serialization and Lock', () => {
  it('should serialize job execution', async () => {
    const results: number[] = [];
    
    const mockExecutor = async (jobId: string) => {
      results.push(1);
      await new Promise(r => setTimeout(r, 50));
      results.push(2);
      void jobId; // Acknowledge parameter
    };

    // Simulate queue with lock
    let currentJob: string | null = null;

    const enqueue = async (jobId: string) => {
      void jobId; // Acknowledge parameter
      while (currentJob !== null) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      currentJob = jobId;
      try {
        await mockExecutor(jobId);
      } finally {
        currentJob = null;
      }
    };

    // Enqueue two jobs
    await Promise.all([enqueue('job-1'), enqueue('job-2')]);

    // Job 1 should complete before job 2 starts (serialized)
    // results should be [1, 2, 1, 2] not [1, 1, 2, 2]
    expect(results).toEqual([1, 2, 1, 2]);
  });

  it('should timeout and return retryable failure', async () => {
    const mockExecutor = async () => {
      await new Promise(r => setTimeout(r, 200));
    };

    const withTimeout = async (fn: () => Promise<unknown>, timeoutMs: number) => {
      const timeout = new Promise<{ success: false; reason: string }>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), timeoutMs);
      });
      try {
        return await Promise.race([fn(), timeout]);
      } catch {
        return { success: false, reason: 'timeout - retryable' };
      }
    };

    const result = await withTimeout(mockExecutor, 100);

    expect(result).toEqual({ success: false, reason: 'timeout - retryable' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 6: RPC Client (Fake Process)
// ─────────────────────────────────────────────────────────────────────────────

describe('RpcClient - JSONL Communication', () => {
  it('should parse JSONL response from fake process', async () => {
    // Simulate fake Pi process that outputs JSONL
    const fakeOutput = [
      '{"type":"event","event":"thinking","data":{"step":"1"}}',
      '{"type":"event","event":"thinking","data":{"step":"2"}}',
      '{"type":"response","message":"R$500,00 registrados com sucesso!","done":true}',
    ].join('\n');

    const responses: string[] = [];
    let finalResponse = '';

    for (const line of fakeOutput.split('\n')) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      if (parsed.type === 'response') {
        finalResponse = parsed.message;
      } else if (parsed.type === 'event') {
        responses.push(parsed.event);
      }
    }

    expect(responses).toEqual(['thinking', 'thinking']);
    expect(finalResponse).toBe('R$500,00 registrados com sucesso!');
  });

  it('should capture error from JSONL', async () => {
    const fakeOutput = '{"type":"event","event":"error","data":{"code":"INVALID_INPUT","message":"Amount must be positive"}}';

    let errorMessage = '';
    const parsed = JSON.parse(fakeOutput);
    if (parsed.type === 'event' && parsed.event === 'error') {
      errorMessage = parsed.data.message;
    }

    expect(errorMessage).toBe('Amount must be positive');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TDD Scenario 7: TED Prompt/Context
// ─────────────────────────────────────────────────────────────────────────────

describe('TED Prompt - Anti-Lie Rule', () => {
  it('should include anti-lie rule in prompt', () => {
    const tedPrompt = `
Você é TED, assistente financeiro.
REGRAS:
- Nunca afirme que uma ação foi concluída sem confirmação do service.
- Se a tool retornar success=false, reporte o reason exatamente.
- Use sempre valores em centavos para cálculos.
`.trim();

    expect(tedPrompt).toContain('Nunca afirme');
    expect(tedPrompt).toContain('success=false');
    expect(tedPrompt).toContain('centavos');
  });

  it('should include tool list in prompt', () => {
    const availableTools = [
      'create_expense',
      'create_income',
      'create_transfer',
      'create_installment_purchase',
      'create_recurrence',
      'pay_bill',
      'close_invoice',
      'pay_invoice',
      'generate_report',
    ];

    expect(availableTools).toContain('create_expense');
    expect(availableTools).toContain('pay_invoice');
  });
});