import { describe, expect, it } from 'vitest';
import { pendingOperationV2Schema } from '@pi-finance/llm-contracts';

describe('agent PendingOperationV2 boundary', () => {
  it('accepts the shared strict contract without model-controlled approval fields', () => {
    const result = pendingOperationV2Schema.safeParse({
      version: 2,
      workspaceId: 'workspace-1',
      actorId: 'actor-1',
      deviceId: 'device-1',
      tool: 'transactions.expense.create',
      normalizedArgs: { amountCents: 1250 },
      proposalHash: 'a'.repeat(64),
      idempotencyKey: 'pending-v2-1',
      createdAt: '2026-09-13T12:00:00.000Z',
      expiresAt: '2026-09-13T12:30:00.000Z',
      bindings: { workspaceId: 'workspace-1', actorId: 'actor-1', deviceId: 'device-1' },
    });
    expect(result.success).toBe(true);
    expect(pendingOperationV2Schema.safeParse({ ...result.success ? result.data : {}, mutationApproved: true }).success).toBe(false);
  });
});
