import { requestPiApiJson } from '../tools/api-client.js';
import { emitSanitizedEvent } from '../observability/events.js';
import { mutationReceiptSchema, type MutationReceipt } from '@pi-finance/llm-contracts';
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
  /**
   * T3.3 (SPEC §15.1): the REAL receipt emitted by the API on TX2 success,
   * schema-validated here and relayed to the PWA for reconciliation.
   * Never synthesized from LLM output; never carries attestation material
   * (the strict contract schema rejects unknown keys wholesale).
   */
  receipt?: MutationReceipt;
};

/**
 * T3.3: projects the browser-safe receipt out of an authoritative execute
 * response (`execution.receipt`, persisted in the same TX2 as `mutation_id`).
 * A malformed or authority-tainted receipt parses to undefined — the PWA
 * then falls back to the documented mutationKind mapping.
 */
const receiptFromExecution = (result: { execution?: unknown }): MutationReceipt | undefined => {
  const execution = result.execution;
  if (!execution || typeof execution !== 'object') return undefined;
  const receipt = (execution as { receipt?: unknown }).receipt;
  if (!receipt || typeof receipt !== 'object') return undefined;
  const parsed = mutationReceiptSchema.safeParse(receipt);
  return parsed.success ? (parsed.data as MutationReceipt) : undefined;
};

export class MutationExecutor {
  private readonly consumed = new Set<string>();
  private readonly events: (eventType: string, fields: Record<string, unknown>) => void;
  constructor(private readonly deps: { request?: typeof requestPiApiJson; events?: (eventType: string, fields: Record<string, unknown>) => void } = {}) {
    this.events = deps.events ?? emitSanitizedEvent;
  }
  private emit(eventType: string, fields: Record<string, unknown>): void {
    try {
      this.events(eventType, fields);
    } catch {
      // Observability must never break the approval flow.
    }
  }
  async confirm(operationId: string, identity: MutationExecution['identity'], delegatedToken?: string): Promise<{ operationId: string; attestation: string }> {
    const request = this.deps.request ?? requestPiApiJson;
    const result = await request<{ id?: unknown; attestation?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(operationId)}/confirm`, { delegatedToken, headers: { 'x-workspace-id': identity.workspaceId, 'x-actor-id': identity.actorId, 'x-device-id': identity.deviceId } });
    if (typeof result.attestation !== 'string' || result.attestation.length < 32) throw new Error('approval.missing_attestation');
    return { operationId: typeof result.id === 'string' ? result.id : operationId, attestation: result.attestation };
  }
  async execute(input: MutationExecution, delegatedToken?: string): Promise<{ status: 'succeeded'; operationId: string; receipt?: MutationReceipt }> {
    if (typeof input.attestation !== 'string' || input.attestation.length < 32) {
      this.emit('mutation.blocked', { status: 'blocked', error: 'approval.invalid_attestation' });
      throw new Error('approval.invalid_attestation');
    }
    if (this.consumed.has(input.attestation)) {
      this.emit('mutation.blocked', { status: 'blocked', error: 'approval.attestation_replayed' });
      throw new Error('approval.attestation_replayed');
    }
    this.consumed.add(input.attestation);
    const request = this.deps.request ?? requestPiApiJson;
    const result = await request<{ status?: unknown; operationId?: unknown; execution?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(input.operationId)}/execute`, { delegatedToken, body: { attestation: input.attestation }, headers: { 'x-workspace-id': input.identity.workspaceId, 'x-actor-id': input.identity.actorId, 'x-device-id': input.identity.deviceId } });
    if (result.status !== 'succeeded' || typeof result.operationId !== 'string') {
      this.emit('mutation.blocked', { status: 'blocked', error: 'approval.incomplete_result' });
      throw new Error('approval.incomplete_result');
    }
    this.emit('mutation.executed', { status: 'succeeded' });
    const receipt = receiptFromExecution(result);
    return { status: 'succeeded', operationId: result.operationId, ...(receipt ? { receipt } : {}) };
  }

  async decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult> {
    if (!input.operationId || !input.requestId || !input.delegatedToken) throw new Error('approval.decision_context_required');
    if (!input.identity.deviceId) throw new Error('mutation.device_required');
    const request = this.deps.request ?? requestPiApiJson;
    const headers = { 'x-workspace-id': input.identity.workspaceId, 'x-actor-id': input.identity.actorId, 'x-device-id': input.identity.deviceId };
    if (input.decision === 'cancel') {
      const result = await request<{ id?: unknown; executionStatus?: unknown; status?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(input.operationId)}/cancel`, { delegatedToken: input.delegatedToken, headers });
      this.emit('approval.rejected', { status: 'rejected' });
      return { operationId: typeof result.id === 'string' ? result.id : input.operationId, status: 'cancelled' };
    }
    const path = input.decision === 'retry' ? 'retry' : 'confirm';
    const confirmation = await request<{ id?: unknown; attestation?: unknown }>('POST', `/pending-operations/v2/${encodeURIComponent(input.operationId)}/${path}`, { delegatedToken: input.delegatedToken, headers });
    if (typeof confirmation.attestation !== 'string' || confirmation.attestation.length < 32) {
      this.emit('approval.expired', { status: 'expired', error: 'approval.missing_attestation' });
      throw new Error('approval.missing_attestation');
    }
    this.emit('approval.confirmed', { status: 'confirmed' });
    return this.execute({ operationId: typeof confirmation.id === 'string' ? confirmation.id : input.operationId, attestation: confirmation.attestation, identity: input.identity }, input.delegatedToken);
  }
}
