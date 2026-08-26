import type { AuditLog, AuditLogStore } from '../audit/store.js';
import type { WriteStore } from '../writes/store.js';
import { domainErrors } from '../writes/errors.js';

export type UndoResult = {
  undone: {
    operation: string;
    entityId: string;
    reversal: string;
  };
};

export type UndoService = {
  undo(householdId: string, actorId: string, idempotencyKey: string): Promise<UndoResult>;
};

const REVERSIBLE_OPERATIONS = new Set([
  'transactions.expense.create',
  'transactions.income.create',
  'transactions.transfer.create',
  'accounts.create',
  'categories.create',
]);

export const createUndoService = (deps: { auditLogs: AuditLogStore; writes: WriteStore }): UndoService => {
  const completed = new Map<string, UndoResult>();
  const undone = new Set<string>();

  const applyReversal = async (householdId: string, log: AuditLog): Promise<string> => {
    const entityId = String(log.metadata.entityId);
    switch (log.operation) {
      case 'transactions.expense.create':
      case 'transactions.income.create':
      case 'transactions.transfer.create':
        await deps.writes.softDeleteTransaction(householdId, entityId);
        return 'soft_delete';
      case 'accounts.create':
        await deps.writes.deactivateAccount(householdId, entityId);
        return 'deactivate';
      case 'categories.create':
        await deps.writes.deactivateCategory(householdId, entityId);
        return 'deactivate';
      default:
        throw domainErrors.undoNothingToUndo();
    }
  };

  return {
    async undo(householdId, actorId, idempotencyKey) {
      if (completed.has(idempotencyKey)) return completed.get(idempotencyKey)!;
      const { items } = await deps.auditLogs.listAuditLogs(householdId, { limit: 50 });
      const candidates = items
        .filter(
          (log) =>
            log.actorId === actorId &&
            REVERSIBLE_OPERATIONS.has(log.operation) &&
            log.metadata.entityId !== undefined &&
            !undone.has(`${householdId}:${log.metadata.entityId}`),
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      if (candidates.length === 0) throw domainErrors.undoNothingToUndo();
      const target = candidates[0]!;
      const reversal = await applyReversal(householdId, target);
      undone.add(`${householdId}:${target.metadata.entityId}`);
      const result: UndoResult = {
        undone: { operation: target.operation, entityId: String(target.metadata.entityId), reversal },
      };
      completed.set(idempotencyKey, result);
      return result;
    },
  };
};
