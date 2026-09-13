import type { PendingOperationV2 } from '@pi-finance/llm-contracts';
import { requestPiApiJson } from '../tools/api-client.js';
import { createMutationProposal, type MutationProposal } from './mutation-proposal.js';
import { MutationExecutor, type ApprovalDecisionInput, type ApprovalDecisionResult, type MutationExecution } from './mutation-executor.js';

export type MutationIdentity = MutationExecution['identity'];
export type MutationRequest = typeof requestPiApiJson;

/** Single Agent-side transport facade for the authoritative V2 approval API. */
export class MutationApiClient {
  private readonly executor: MutationExecutor;
  private readonly request: MutationRequest;

  constructor(deps: { request?: MutationRequest } = {}) {
    this.request = deps.request ?? requestPiApiJson;
    this.executor = new MutationExecutor({ request: this.request });
  }

  propose(input: {
    tool: string;
    normalizedArgs: PendingOperationV2['normalizedArgs'];
    summary: string;
    identity: MutationIdentity;
    idempotencyKey: string;
  }): Promise<MutationProposal> {
    return createMutationProposal({ ...input, request: this.request });
  }

  confirm(operationId: string, identity: MutationIdentity): Promise<{ operationId: string; attestation: string }> {
    return this.executor.confirm(operationId, identity);
  }

  execute(input: MutationExecution): Promise<{ status: 'succeeded'; operationId: string }> {
    return this.executor.execute(input);
  }

  decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult> {
    return this.executor.decide(input);
  }
}
