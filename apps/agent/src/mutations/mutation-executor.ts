import { requestPiApiJson } from '../tools/api-client.js';
export type MutationExecution = { operationId: string; attestation: string; identity: { workspaceId: string; actorId: string; deviceId: string } };
export type ApprovalDecision = 'confirm' | 'cancel' | 'retry';
export type ApprovalDecisionInput = {
  operationId: string;
  decision: ApprovalDecision;
  requestId: string;
  delegatedToken: string;
  identity: { workspaceId: string; actorId: string; deviceId: string };
};
export type ApprovalDecisionResult = {
  operationId: string;
  status: 'succeeded' | 'cancelled' | 'failed' | 'expired' | 'proposed' | 'confirmed';
  retryable?: boolean;
};

export class MutationExecutor {
  private readonly consumed = new Set<string>();
  constructor(private readonly deps: { request?: typeof requestPiApiJson } = {}) {}
  async confirm(operationId: string, identity: MutationExecution['identity'], delegatedToken?: string): Promise<{ operationId: string; attestation: string }> {
    const request = this.deps.request ?? requestPiApiJson;
    const result = await request<{ id?: unknown; attestation?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(operationId)}/confirm`, { delegatedToken, headers: { 'x-workspace-id': identity.workspaceId, 'x-actor-id': identity.actorId, 'x-device-id': identity.deviceId } });
    if (typeof result.attestation !== 'string' || result.attestation.length < 32) throw new Error('approval.missing_attestation');
    return { operationId: typeof result.id === 'string' ? result.id : operationId, attestation: result.attestation };
  }
  async execute(input: MutationExecution, delegatedToken?: string): Promise<{ status: 'succeeded'; operationId: string }> {
    if (typeof input.attestation !== 'string' || input.attestation.length < 32) throw new Error('approval.invalid_attestation');
    if (this.consumed.has(input.attestation)) throw new Error('approval.attestation_replayed');
    this.consumed.add(input.attestation);
    const request = this.deps.request ?? requestPiApiJson;
    const result = await request<{ status?: unknown; operationId?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(input.operationId)}/execute`, { delegatedToken, body: { attestation: input.attestation }, headers: { 'x-workspace-id': input.identity.workspaceId, 'x-actor-id': input.identity.actorId, 'x-device-id': input.identity.deviceId } });
    if (result.status !== 'succeeded' || typeof result.operationId !== 'string') throw new Error('approval.incomplete_result');
    return { status: 'succeeded', operationId: result.operationId };
  }

  async decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult> {
    if (!input.operationId || !input.requestId || !input.delegatedToken) throw new Error('approval.decision_context_required');
    if (!input.identity.deviceId) throw new Error('mutation.device_required');
    const request = this.deps.request ?? requestPiApiJson;
    const headers = { 'x-workspace-id': input.identity.workspaceId, 'x-actor-id': input.identity.actorId, 'x-device-id': input.identity.deviceId };
    if (input.decision === 'cancel') {
      const result = await request<{ id?: unknown; executionStatus?: unknown; status?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(input.operationId)}/cancel`, { delegatedToken: input.delegatedToken, headers });
      return { operationId: typeof result.id === 'string' ? result.id : input.operationId, status: 'cancelled' };
    }
    const path = input.decision === 'retry' ? 'retry' : 'confirm';
    const confirmation = await request<{ id?: unknown; attestation?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(input.operationId)}/${path}`, { delegatedToken: input.delegatedToken, headers });
    if (typeof confirmation.attestation !== 'string' || confirmation.attestation.length < 32) throw new Error('approval.missing_attestation');
    return this.execute({ operationId: typeof confirmation.id === 'string' ? confirmation.id : input.operationId, attestation: confirmation.attestation, identity: input.identity }, input.delegatedToken);
  }
}
