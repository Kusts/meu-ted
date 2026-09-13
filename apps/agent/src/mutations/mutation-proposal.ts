import { computePendingOperationV2Hash, type PendingOperationV2 } from '@pi-finance/llm-contracts';
import { requestPiApiJson } from '../tools/api-client.js';
import { createV2BindingManifest, type V2BindingManifest } from './binding-manifest.js';

export type MutationProposal = Readonly<{ operation: PendingOperationV2; id: string; summary: string; bindings: V2BindingManifest }>;
export const createMutationProposal = async (input: { tool: string; normalizedArgs: PendingOperationV2['normalizedArgs']; summary: string; identity: { workspaceId: string; actorId: string; deviceId: string }; idempotencyKey: string; request?: typeof requestPiApiJson }): Promise<MutationProposal> => {
  if ((input.tool === 'create_expense' || input.tool === 'transactions.expense.create') && typeof input.normalizedArgs.categoryId !== 'string') throw new Error('mutation.category_required');
  const request = input.request ?? requestPiApiJson;
  const base = { version: 2 as const, ...input.identity, tool: input.tool, normalizedArgs: input.normalizedArgs, proposalHash: '', idempotencyKey: input.idempotencyKey, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), bindings: input.identity };
  const operation = { ...base, proposalHash: await computePendingOperationV2Hash(base) };
  const created = await request<{ id: string }>('POST', '/pending-operations/v2/propose', { body: { tool: operation.tool, normalizedArgs: operation.normalizedArgs, expiresAt: operation.expiresAt }, idempotencyKey: operation.idempotencyKey, headers: { 'x-workspace-id': operation.workspaceId, 'x-actor-id': operation.actorId, 'x-device-id': operation.deviceId } });
  return Object.freeze({ operation, id: created.id, summary: input.summary, bindings: createV2BindingManifest({ ...input.identity, proposalHash: operation.proposalHash, pendingOperationId: created.id, idempotencyKey: operation.idempotencyKey }) });
};
