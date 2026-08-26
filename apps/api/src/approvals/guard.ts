import type { ApprovalPolicy } from './policy.js';
import type { PendingOperationStore } from './pending.js';

export type ApprovalGuardInput = {
  householdId: string;
  requesterId: string;
  /** Server-owned channel context; absent for non-bridge API calls. */
  chatId?: string;
  operation: string;
  payload: unknown;
  idempotencyKey: string;
  amountCents?: number;
  destructive: boolean;
};

export type PendingApprovalResponse = {
  status: 202;
  body: {
    status: 'pending_approval';
    pendingOperationId: string;
    reason: 'high_value' | 'destructive';
  };
};

export const createPendingApproval = async (
  policy: ApprovalPolicy,
  pendingOperations: PendingOperationStore,
  input: ApprovalGuardInput,
): Promise<PendingApprovalResponse | undefined> => {
  const decision = input.destructive
    ? { requiresApproval: true as const, reason: 'destructive' as const }
    : policy.evaluate({
      workspaceId: input.householdId,
      operation: input.operation,
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      destructive: false,
    });
  if (!decision.requiresApproval) return undefined;

  const pending = await pendingOperations.create({
    householdId: input.householdId,
    requesterId: input.requesterId,
    ...(input.chatId !== undefined ? { chatId: input.chatId } : {}),
    operation: input.operation,
    payload: input.payload,
    reason: decision.reason,
    idempotencyKey: input.idempotencyKey,
  });
  return {
    status: 202,
    body: { status: 'pending_approval', pendingOperationId: pending.id, reason: pending.reason },
  };
};
