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
  undo(householdId: string, actorId: string, idempotencyKey: string, lastOperationId?: string): Promise<UndoResult>;
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

  const resolveEntityId = (log: AuditLog): string | undefined => {
    const metaId = log.metadata.entityId;
    if (metaId !== undefined && metaId !== null) return String(metaId);
    if (log.effectRef) return String(log.effectRef);
    const after = (log.metadata.after as Record<string, unknown> | undefined)?.id;
    if (after) return String(after);
    return undefined;
  };

  const applyReversal = async (householdId: string, log: AuditLog): Promise<string> => {
    const entityId = resolveEntityId(log);
    if (!entityId) throw domainErrors.undoNothingToUndo();
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
    async undo(householdId, actorId, idempotencyKey, lastOperationId) {
      const compositeKey = `${householdId}:${idempotencyKey}`;
      if (completed.has(compositeKey)) return completed.get(compositeKey)!;
      const { items } = await deps.auditLogs.listAuditLogs(householdId, { limit: 50 });
      const candidates = items
        .filter(
          (log) =>
            REVERSIBLE_OPERATIONS.has(log.operation) &&
            resolveEntityId(log) !== undefined &&
            !undone.has(`${householdId}:${resolveEntityId(log)}`),
        )
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      let target: AuditLog | undefined;
      if (lastOperationId) {
        target = candidates.find((log) => log.id === lastOperationId);
        if (!target) throw domainErrors.undoNothingToUndo();
      } else {
        // Prefer actor's own operations when possible, fallback to household-wide most recent
        const own = candidates.filter((log) => log.actorId === actorId);
        const pool = own.length > 0 ? own : candidates;
        if (pool.length === 0) throw domainErrors.undoNothingToUndo();
        target = pool[0]!;
      }
      const entityId = resolveEntityId(target)!;
      const reversal = await applyReversal(householdId, target);
      undone.add(`${householdId}:${entityId}`);
      const result: UndoResult = {
        undone: { operation: target.operation, entityId, reversal },
      };
      completed.set(compositeKey, result);
      return result;
    },
  };
};
