import { describe, expect, it, vi } from 'vitest';
import { createPendingOperationExecutor } from '../../src/approvals/executor.js';
import type { WriteStore } from '../../src/writes/store.js';
import type { PayableStore } from '../../src/payables/store.js';
import type { PendingOperation } from '../../src/approvals/pending.js';

const operation = (name: string, payload: unknown): PendingOperation => ({
  id: '00000000-0000-0000-0000-000000000042', householdId: 'workspace-1', requesterId: 'user-1',
  operation: name, payload, reason: 'high_value', idempotencyKey: 'intent-42', status: 'approved',
  createdAt: '2026-08-04T18:00:00.000Z', expiresAt: '2099-08-04T18:30:00.000Z',
});

/**
 * V4.1 REVIEWFIX F2 (executor passthrough) + F8 [major] (strict PATCH).
 *
 * - F2: a persisted payables.unpay payload carrying paidTransactionId must
 *   reach the store as expectedPaidTransactionId (D4 contract survives the
 *   approval round-trip).
 * - F8: the executor must validate persisted transactions.update payloads
 *   with updateTransactionInputSchema — an unknown field fails the operation
 *   (sanitized error) and the store stays untouched.
 */
describe('V4.1 REVIEWFIX — executor payables.unpay passthrough + strict PATCH', () => {
  it('F2: payables.unpay forwards paidTransactionId as expectedPaidTransactionId', async () => {
    const undoPayablePayment = vi.fn().mockResolvedValue({ id: 'pay-1' });
    const executor = createPendingOperationExecutor({
      writes: {} as WriteStore,
      payableStore: { undoPayablePayment } as unknown as PayableStore,
    });

    await executor(operation('payables.unpay', {
      id: 'pay-1', paidTransactionId: 'tx-9',
    }));

    expect(undoPayablePayment).toHaveBeenCalledWith('workspace-1', 'pay-1', {
      expectedPaidTransactionId: 'tx-9',
    });
  });

  it('F8: transactions.update with an unknown field fails without touching the store', async () => {
    const updateTransaction = vi.fn();
    const executor = createPendingOperationExecutor({
      writes: { updateTransaction } as unknown as WriteStore,
    });

    await expect(executor(operation('transactions.update', {
      id: 'tx-1', description: 'Ok', bogusField: true,
    }))).rejects.toMatchObject({ code: 'validation.invalid' });
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it('F8 control: transactions.update with a valid payload still executes', async () => {
    const updateTransaction = vi.fn().mockResolvedValue({ id: 'tx-1' });
    const executor = createPendingOperationExecutor({
      writes: { updateTransaction } as unknown as WriteStore,
    });

    await expect(executor(operation('transactions.update', {
      id: 'tx-1', description: 'Ok',
    }))).resolves.toEqual({ id: 'tx-1' });
    expect(updateTransaction).toHaveBeenCalledWith(
      'workspace-1', 'tx-1', { description: 'Ok' },
    );
  });
});
