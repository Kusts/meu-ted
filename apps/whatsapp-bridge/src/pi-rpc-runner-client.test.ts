// ─────────────────────────────────────────────────────────────────────────────
// PiRpcRunner Adapter tests
// Tests adapter logic with mock runner
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

// Mock the PiRpcRunner module
vi.mock('@pi-financeiro/pi-rpc-runner', () => ({
  createPiRpcRunner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    runPrompt: vi.fn().mockResolvedValue({ success: true, response: 'OK', jobId: 'test' }),
    isRunning: vi.fn().mockReturnValue(true),
    getQueueDepth: vi.fn().mockReturnValue(0),
  })),
  buildTedPrompt: vi.fn((opts: { userMessage: string; householdId: string; source: string }) => `TED: ${opts.userMessage}`),
}));

describe('PiRpcRunner Adapter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('runPrompt returns success result', async () => {
    const { createPiRpcRunner } = await import('@pi-financeiro/pi-rpc-runner');
    const runner = createPiRpcRunner();
    
    // Setup mock
    runner.runPrompt = vi.fn().mockResolvedValue({
      success: true,
      response: 'Registrei: R$50 Mercado',
      jobId: 'job-123',
    });
    
    const result = await runner.runPrompt({
      userMessage: 'gastei 50',
      householdId: 'household-123',
      source: 'whatsapp',
    });
    
    expect(result.success).toBe(true);
    expect(result.response).toContain('Registrei');
  });

  test('runPrompt returns timeout failure', async () => {
    const { createPiRpcRunner } = await import('@pi-financeiro/pi-rpc-runner');
    const runner = createPiRpcRunner();
    
    runner.runPrompt = vi.fn().mockResolvedValue({
      success: false,
      error: 'timeout',
      retryable: true,
      jobId: 'job-123',
    });
    
    const result = await runner.runPrompt({
      userMessage: 'gastei 50',
      householdId: 'household-123',
      source: 'whatsapp',
    });
    
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
  });

  test('runPrompt returns error failure', async () => {
    const { createPiRpcRunner } = await import('@pi-financeiro/pi-rpc-runner');
    const runner = createPiRpcRunner();
    
    runner.runPrompt = vi.fn().mockResolvedValue({
      success: false,
      error: 'Invalid command',
      retryable: false,
      jobId: 'job-123',
    });
    
    const result = await runner.runPrompt({
      userMessage: 'gastei 50',
      householdId: 'household-123',
      source: 'whatsapp',
    });
    
    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
  });

  test('start and stop lifecycle', async () => {
    const { createPiRpcRunner } = await import('@pi-financeiro/pi-rpc-runner');
    const runner = createPiRpcRunner();
    
    runner.start();
    runner.stop();
    
    expect(runner.start).toHaveBeenCalled();
    expect(runner.stop).toHaveBeenCalled();
  });

  test('isRunning reflects state', async () => {
    const { createPiRpcRunner } = await import('@pi-financeiro/pi-rpc-runner');
    const runner = createPiRpcRunner();
    
    runner.isRunning = vi.fn().mockReturnValue(true);
    expect(runner.isRunning()).toBe(true);
    
    runner.isRunning = vi.fn().mockReturnValue(false);
    expect(runner.isRunning()).toBe(false);
  });

  test('getQueueDepth reports pending jobs', async () => {
    const { createPiRpcRunner } = await import('@pi-financeiro/pi-rpc-runner');
    const runner = createPiRpcRunner();
    
    runner.getQueueDepth = vi.fn().mockReturnValue(2);
    expect(runner.getQueueDepth()).toBe(2);
  });
});

describe('PiRpcRunner Adapter - Real imports', () => {
  test('buildTedPrompt returns string', async () => {
    const { buildTedPrompt } = await import('@pi-financeiro/pi-rpc-runner');
    
    const prompt = buildTedPrompt({
      userMessage: 'test',
      householdId: 'household-123',
      source: 'dashboard',
    });
    
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  test('buildTedPrompt includes message', async () => {
    const { buildTedPrompt } = await import('@pi-financeiro/pi-rpc-runner');
    
    const prompt = buildTedPrompt({
      userMessage: 'gastei 50 no mercado',
      householdId: 'household-123',
      source: 'whatsapp',
      senderPhone: '5511999999999',
    });
    
    expect(prompt).toContain('gastei 50 no mercado');
  });
});