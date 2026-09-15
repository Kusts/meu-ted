import type { AuditLog, AuditLogStore } from '../audit/store.js';
import type { WriteStore } from '../writes/store.js';
import { domainErrors } from '../writes/errors.js';
import { createInMemoryIdempotencyStore, type IdempotencyStore } from '../writes/idempotency.js';
import type { MutationReceipt } from '@pi-finance/llm-contracts';
import { resolveUndoReceipt } from '../reconciliation/effects-registry.js';

export type UndoResult = {
  undone: {
    operation: string;
    entityId: string;
    reversal: string;
  };
  /** Server-generated receipt (SPEC §15.1, T3.2): registry-derived targets, no operationId. */
  receipt: MutationReceipt;
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

/**
 * Namespace isolating undo records inside the shared `IdempotencyStore`
 * (same pattern as `pending-v2:` in pending-idempotency.ts): undo keys never
 * collide with HTTP-layer write keys sharing the same store/table.
 */
export const UNDO_IDEMPOTENCY_PREFIX = 'audit-undo:';

export const createUndoService = (deps: {
  auditLogs: AuditLogStore;
  writes: WriteStore;
  /** Persistent store shared with the writes (in-memory ↔ in-memory, Postgres ↔ Postgres). */
  idempotency?: IdempotencyStore;
}): UndoService => {
  const idempotency = deps.idempotency ?? createInMemoryIdempotencyStore();
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
      // FIX-P1-UNDO-IDEMPOTENCY: atomic claim BEFORE applyReversal through
      // the shared IdempotencyStore. Concurrent callers with the same key
      // attach to the winner's in-flight execution (in-memory) or lose the
      // claim race (Postgres) and replay the canonical recorded result —
      // the reversal runs EXACTLY once. Same key + divergent
      // lastOperationId → payload mismatch → idempotency.conflict.
      const namespacedKey = `${UNDO_IDEMPOTENCY_PREFIX}${idempotencyKey}`;
      const payload = { lastOperationId: lastOperationId ?? null };
      const { response } = await idempotency.lookupOrRecord(householdId, namespacedKey, payload, async () => {
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
        // Receipt is built inside the claim (before the idempotency record
        // write) so replays return the identical receipt.
        const receipt = resolveUndoReceipt(target.operation, entityId);
        const result: UndoResult = {
          undone: { operation: target.operation, entityId, reversal },
          receipt,
        };
        return result;
      });
      return response;
    },
  };
};
