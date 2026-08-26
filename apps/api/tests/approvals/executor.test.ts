import { describe, expect, it, vi } from 'vitest';
import { createPendingOperationExecutor } from '../../src/approvals/executor.js';
import type { WriteStore } from '../../src/writes/store.js';
import type { PendingOperation } from '../../src/approvals/pending.js';

const operation = (name: string, payload: unknown): PendingOperation => ({
  id: '00000000-0000-0000-0000-000000000001', householdId: 'workspace-1', requesterId: 'user-1',
  operation: name, payload, reason: 'high_value', idempotencyKey: 'intent-1', status: 'approved',
  createdAt: '2026-08-04T18:00:00.000Z', expiresAt: '2099-08-04T18:30:00.000Z',
});

describe('pending operation executor', () => {
  it('dispatches the persisted transaction payload to the scoped write store', async () => {
    const createExpense = vi.fn().mockResolvedValue({ id: 'tx-1' });
    const executor = createPendingOperationExecutor({ writes: { createExpense } as unknown as WriteStore });

    await expect(executor(operation('transactions.expense.create', {
      description: 'Lunch', amountCents: 50_000, date: '2026-08-04', accountId: 'account-1', categoryId: 'category-1',
    }))).resolves.toEqual({ id: 'tx-1' });
    expect(createExpense).toHaveBeenCalledWith('workspace-1', expect.objectContaining({ amountCents: 50_000 }));
  });

  it('rejects an operation that has no registered executor', async () => {
    const executor = createPendingOperationExecutor({ writes: {} as WriteStore });
    await expect(executor(operation('unknown.operation', {}))).rejects.toMatchObject({ code: 'unsupported' });
  });
});
