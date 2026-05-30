// ─────────────────────────────────────────────────────────────────────────────
// API Client Tests
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, test, vi, beforeEach } from 'vitest';
import { createApiClient } from './api-client';

describe('API Client', () => {
  const householdId = 'h1';

  // Simple mock fetch factory
  function createMockFetch() {
    const mock = vi.fn();
    return mock;
  }

  function createMockClient() {
    const mockFetch = createMockFetch();
    const client = createApiClient('http://localhost:3000', mockFetch as any);
    return { client, mockFetch };
  }

  describe('health', () => {
    test('returns ok true on success', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      } as any);

      const result = await client.health();

      expect(result.ok).toBe(true);
    });

    test('throws on network error', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.health()).rejects.toThrow('Network error');
    });
  });

  describe('accounts', () => {
    test('list returns accounts array', async () => {
      const { client, mockFetch } = createMockClient();
      const accounts = [
        { id: 'a1', name: 'Conta 1', type: 'checking' },
        { id: 'a2', name: 'Conta 2', type: 'savings' },
      ];
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: accounts }),
      } as any);

      const result = await client.listAccounts(householdId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    test('create returns created account', async () => {
      const { client, mockFetch } = createMockClient();
      const account = { id: 'a1', name: 'Nova Conta', type: 'checking', scope: 'shared' };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: account }),
      } as any);

      const result = await client.createAccount({
        householdId,
        name: 'Nova Conta',
        type: 'checking',
        scope: 'shared',
      });

      expect(result.success).toBe(true);
      expect(result.data?.name).toBe('Nova Conta');
    });

    test('create returns error on invalid input', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        status: 400,
        json: async () => ({ success: false, reason: 'name é obrigatório' }),
      } as any);

      const result = await client.createAccount({
        householdId,
        name: '',
        type: 'checking',
        scope: 'shared',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('name é obrigatório');
    });
  });

  describe('categories', () => {
    test('list returns categories array', async () => {
      const { client, mockFetch } = createMockClient();
      const categories = [
        { id: 'c1', name: 'Alimentação', kind: 'expense' },
        { id: 'c2', name: 'Salário', kind: 'income' },
      ];
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: categories }),
      } as any);

      const result = await client.listCategories(householdId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    test('findOrCreate returns category', async () => {
      const { client, mockFetch } = createMockClient();
      const category = { id: 'c1', name: 'Mercado', kind: 'expense' };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: { category, created: true } }),
      } as any);

      const result = await client.findOrCreateCategory({
        householdId,
        name: 'Mercado',
        kind: 'expense',
      });

      expect(result.success).toBe(true);
      expect(result.data?.category.name).toBe('Mercado');
      expect(result.data?.created).toBe(true);
    });
  });

  describe('records', () => {
    test('createExpense returns record', async () => {
      const { client, mockFetch } = createMockClient();
      const record = { id: 'r1', type: 'expense', amountCents: 5000 };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: record }),
      } as any);

      const result = await client.createExpense({
        householdId,
        accountId: 'a1',
        amountCents: 5000,
        description: 'Mercado',
        date: '2026-05-29',
        source: 'dashboard',
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('expense');
    });

    test('createExpense returns error on invalid account', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        status: 422,
        json: async () => ({ success: false, reason: 'Conta não encontrada' }),
      } as any);

      const result = await client.createExpense({
        householdId,
        accountId: 'invalid',
        amountCents: 5000,
        description: 'Test',
        date: '2026-05-29',
        source: 'dashboard',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Conta não encontrada');
    });

    test('createIncome returns record', async () => {
      const { client, mockFetch } = createMockClient();
      const record = { id: 'r1', type: 'income', amountCents: 10000 };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: record }),
      } as any);

      const result = await client.createIncome({
        householdId,
        accountId: 'a1',
        amountCents: 10000,
        description: 'Pix',
        date: '2026-05-29',
        source: 'dashboard',
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('income');
    });

    test('createTransfer returns record', async () => {
      const { client, mockFetch } = createMockClient();
      const record = { id: 'r1', type: 'transfer', amountCents: 1000 };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: record }),
      } as any);

      const result = await client.createTransfer({
        householdId,
        fromAccountId: 'a1',
        toAccountId: 'a2',
        amountCents: 1000,
        description: 'Reserva',
        date: '2026-05-29',
        source: 'dashboard',
      });

      expect(result.success).toBe(true);
      expect(result.data?.type).toBe('transfer');
    });

    test('getRecords returns paginated records', async () => {
      const { client, mockFetch } = createMockClient();
      const records = [
        { id: 'r1', type: 'expense', amountCents: 5000 },
        { id: 'r2', type: 'income', amountCents: 10000 },
      ];
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: { records, total: 50 } }),
      } as any);

      const result = await client.getRecords({
        householdId,
        type: 'expense',
        limit: 20,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.data?.records).toHaveLength(2);
      expect(result.data?.total).toBe(50);
    });

    test('getRecords with date filters', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: { records: [], total: 0 } }),
      } as any);

      const result = await client.getRecords({
        householdId,
        dateFrom: '2026-05-01',
        dateTo: '2026-05-31',
        source: 'whatsapp',
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('dateFrom=2026-05-01'),
        expect.any(Object)
      );
    });

    test('updateRecord returns updated record', async () => {
      const { client, mockFetch } = createMockClient();
      const record = { id: 'r1', description: 'Updated description' };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: record }),
      } as any);

      const result = await client.updateRecord('r1', {
        householdId,
        description: 'Updated description',
      });

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe('Updated description');
    });

    test('updateRecord returns 404 for non-existent record', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        status: 404,
        json: async () => ({ success: false, reason: 'Registro não encontrado' }),
      } as any);

      const result = await client.updateRecord('invalid-id', {
        householdId,
        description: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Registro não encontrado');
    });

    test('deleteRecord returns cancelled record', async () => {
      const { client, mockFetch } = createMockClient();
      const record = { id: 'r1', status: 'cancelled' };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: record }),
      } as any);

      const result = await client.deleteRecord('r1', { householdId });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('cancelled');
    });

    test('deleteRecord returns 404 for non-existent record', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        status: 404,
        json: async () => ({ success: false, reason: 'Registro não encontrado' }),
      } as any);

      const result = await client.deleteRecord('invalid-id', { householdId });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Registro não encontrado');
    });

    test('undoRecord returns original and reversal records', async () => {
      const { client, mockFetch } = createMockClient();
      const data = {
        originalRecord: { id: 'r1', status: 'cancelled' },
        reversalRecord: { id: 'r2', type: 'income', amountCents: 5000 },
      };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data }),
      } as any);

      const result = await client.undoRecord('r1', { householdId });

      expect(result.success).toBe(true);
      expect(result.data?.originalRecord.status).toBe('cancelled');
      expect(result.data?.reversalRecord.type).toBe('income');
    });

    test('undoRecord returns 404 for already cancelled record', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        status: 404,
        json: async () => ({ success: false, reason: 'Registro já está cancelado' }),
      } as any);

      const result = await client.undoRecord('r1', { householdId });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Registro já está cancelado');
    });
  });

  describe('cards', () => {
    test('create returns card', async () => {
      const { client, mockFetch } = createMockClient();
      const card = { id: 'c1', name: 'Nubank', scope: 'shared', closingDay: 20, dueDay: 27 };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: card }),
      } as any);

      const result = await client.createCard({
        householdId,
        name: 'Nubank',
        scope: 'shared',
        closingDay: 20,
        dueDay: 27,
      });

      expect(result.success).toBe(true);
      expect(result.data?.closingDay).toBe(20);
    });

    test('createPurchase returns record with invoiceId', async () => {
      const { client, mockFetch } = createMockClient();
      const data = { record: { id: 'r1' }, invoiceId: 'inv1' };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data }),
      } as any);

      const result = await client.createCardPurchase({
        householdId,
        cardId: 'c1',
        amountCents: 5000,
        description: 'Amazon',
        purchaseDate: '2026-05-29',
        source: 'dashboard',
      });

      expect(result.success).toBe(true);
      expect(result.data?.invoiceId).toBe('inv1');
    });

    test('createInstallments returns installmentGroup', async () => {
      const { client, mockFetch } = createMockClient();
      const group = { id: 'g1', installmentsCount: 3 };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: { installmentGroup: group } }),
      } as any);

      const result = await client.createCardInstallments({
        householdId,
        cardId: 'c1',
        amountCents: 30000,
        description: 'Tênis',
        installmentsCount: 3,
        firstDate: '2026-05-29',
        source: 'dashboard',
      });

      expect(result.success).toBe(true);
      expect(result.data?.installmentGroup.installmentsCount).toBe(3);
    });
  });

  describe('invoices', () => {
    test('close returns closed invoice', async () => {
      const { client, mockFetch } = createMockClient();
      const invoice = { id: 'inv1', status: 'closed' };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: invoice }),
      } as any);

      const result = await client.closeInvoice({ householdId, invoiceId: 'inv1' });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('closed');
    });

    test('pay returns payment record', async () => {
      const { client, mockFetch } = createMockClient();
      const record = { id: 'r1' };
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: record }),
      } as any);

      const result = await client.payInvoice({
        householdId,
        invoiceId: 'inv1',
        amountCents: 5000,
        paymentDate: '2026-05-29',
        source: 'dashboard',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('recurrences', () => {
    test('create returns recurrence with 12 occurrences', async () => {
      const { client, mockFetch } = createMockClient();
      const recurrence = { id: 'rec1', amountCents: 10000 };
      const occurrences = Array(12).fill({ id: 'o1' });
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: { recurrence, occurrences } }),
      } as any);

      const result = await client.createRecurrence({
        householdId,
        description: 'Internet',
        amountCents: 10000,
        period: 'monthly',
        targetType: 'account_debit',
        firstDate: '2026-06-01',
        accountId: 'a1',
      });

      expect(result.success).toBe(true);
      expect(result.data?.occurrences).toHaveLength(12);
    });

    test('maintainHorizon returns success', async () => {
      const { client, mockFetch } = createMockClient();
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ success: true, data: { success: true, createdCount: 3 } }),
      } as any);

      const result = await client.maintainRecurrenceHorizon('rec1');

      expect(result.success).toBe(true);
      expect(result.data?.createdCount).toBe(3);
    });
  });
});
