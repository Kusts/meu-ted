import { describe, expect, test, vi, beforeEach } from 'vitest';
import { PiRpcRunnerClient } from './pi-rpc-runner-client.js';

const mockRunner = {
  start: vi.fn(),
  stop: vi.fn(),
  runPrompt: vi.fn().mockResolvedValue({ success: true, response: 'OK', jobId: 'job-1' }),
  isRunning: vi.fn().mockReturnValue(true),
  getQueueDepth: vi.fn().mockReturnValue(0),
};

vi.mock('@pi-financeiro/pi-rpc-runner', () => ({
  createPiRpcRunner: vi.fn(() => mockRunner),
}));

function makeFinanceApi() {
  return {
    getCurrentMonthSummary: vi.fn().mockResolvedValue({
      success: true,
      data: {
        householdId: 'household-123',
        month: '2026-06',
        incomeCents: 250000,
        expenseCents: 125000,
        transferCents: 0,
        netCents: 125000,
        recordCount: 12,
      },
    }),
    getAccountBalances: vi.fn().mockResolvedValue({
      success: true,
      data: [
        {
          accountId: 'acc-1',
          accountName: 'Inter',
          initialBalanceCents: 0,
          debitCents: 125000,
          creditCents: 250000,
          currentBalanceCents: 125000,
        },
      ],
    }),
  };
}

describe('PiRpcRunnerClient report handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns current month report from finance API without asking Pi tools', async () => {
    const financeApiClient = makeFinanceApi();
    const client = new PiRpcRunnerClient({ enabled: true, financeApiClient });

    const result = await client.send('Quero um relatório desse mês', '5511999999999', {
      householdId: 'household-123',
      source: 'whatsapp',
      idempotencyKey: 'msg-1',
    });

    expect(result.success).toBe(true);
    expect(result.data?.message).toContain('📊 Relatório de 2026-06');
    expect(result.data?.message).toContain('Receitas: R$ 2.500,00');
    expect(result.data?.message).toContain('Inter: R$ 1.250,00');
    expect(financeApiClient.getCurrentMonthSummary).toHaveBeenCalledWith('household-123');
    expect(mockRunner.runPrompt).not.toHaveBeenCalled();
  });

  test('keeps normal messages on Pi runner path', async () => {
    const client = new PiRpcRunnerClient({ enabled: true, financeApiClient: makeFinanceApi() });

    const result = await client.send('Oi TED', '5511999999999', {
      householdId: 'household-123',
      source: 'whatsapp',
    });

    expect(result.success).toBe(true);
    expect(mockRunner.runPrompt).toHaveBeenCalledWith({
      userMessage: 'Oi TED',
      householdId: 'household-123',
      source: 'whatsapp',
      idempotencyKey: undefined,
    });
  });
});
