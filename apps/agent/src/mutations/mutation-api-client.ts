import type { PendingOperationV2 } from '@pi-finance/llm-contracts';
import { requestPiApiJson } from '../tools/api-client.js';
import { emitSanitizedEvent } from '../observability/events.js';
import { createMutationProposal, type MutationProposal } from './mutation-proposal.js';
import { MutationExecutor, type ApprovalDecisionInput, type ApprovalDecisionResult, type MutationExecution } from './mutation-executor.js';

export type MutationIdentity = MutationExecution['identity'];
export type MutationRequest = typeof requestPiApiJson;
export type MutationEventSink = (eventType: string, fields: Record<string, unknown>) => void;

/** Single Agent-side transport facade for the authoritative V2 approval API. */
export class MutationApiClient {
  private readonly executor: MutationExecutor;
  private readonly request: MutationRequest;
  private readonly events: MutationEventSink;

  constructor(deps: { request?: MutationRequest; events?: MutationEventSink } = {}) {
    this.request = deps.request ?? requestPiApiJson;
    this.events = deps.events ?? emitSanitizedEvent;
    this.executor = new MutationExecutor({ request: this.request, events: this.events });
  }

  /** Tool-call lifecycle events carry allowlisted fields only (name, status, latency) — never args or payloads. */
  private async timed<T>(tool: string, fn: () => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      this.events('tool.started', { tool, status: 'started' });
    } catch {
      // Observability must never break the mutation flow.
    }
    try {
      const result = await fn();
      try {
        this.events('tool.completed', { tool, status: 'completed', latencyMs: Date.now() - startedAt });
      } catch {
        // Best effort.
      }
      return result;
    } catch (error) {
      try {
        this.events('tool.completed', { tool, status: 'failed', latencyMs: Date.now() - startedAt, error });
      } catch {
        // Best effort.
      }
      throw error;
    }
  }

  propose(input: {
    tool: string;
    normalizedArgs: PendingOperationV2['normalizedArgs'];
    summary: string;
    identity: MutationIdentity;
    idempotencyKey: string;
  }): Promise<MutationProposal> {
    return this.timed('transactions.propose', () => createMutationProposal({ ...input, request: this.request }));
  }

  confirm(operationId: string, identity: MutationIdentity): Promise<{ operationId: string; attestation: string }> {
    return this.timed('transactions.confirm', () => this.executor.confirm(operationId, identity));
  }

  execute(input: MutationExecution): Promise<{ status: 'succeeded'; operationId: string }> {
    return this.timed('transactions.execute', () => this.executor.execute(input));
  }

  decide(input: ApprovalDecisionInput): Promise<ApprovalDecisionResult> {
    return this.timed('transactions.decide', () => this.executor.decide(input));
  }
}
