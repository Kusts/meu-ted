import { scrubForPersistence } from '../privacy/dlp.js';
import { parseFinancialMutation } from '../mutations/financial-parser.js';
import { resolveMutationEntities, type EntityReader } from '../mutations/entity-resolver.js';
import { resolveConfirmation } from '../mutations/confirmation-resolver.js';
import type { MutationApiClient, MutationIdentity } from '../mutations/mutation-api-client.js';
import { emitSanitizedEvent } from '../observability/events.js';
import type { EvidenceEnvelope } from '../evidence/evidence-envelope.js';
import { createGroundedResponseWithRetry } from '../responses/grounded-response.js';
import { renderBalance, renderEmpty, renderMutationResult, renderStatement, renderUnavailable } from '../responses/deterministic-responses.js';
import { routeIntent } from './intent-router.js';

export type ConversationChannel = 'pwa-rest' | 'sdk' | 'broker';

export type SafeAttachmentMetadata = Readonly<{
  name: string;
  type?: string;
  size?: number;
}>;

export type TurnInput = Readonly<{
  intentionId: string;
  traceId: string;
  text: string;
  actorId: string;
  workspaceId: string;
  role: 'owner' | 'member';
  deviceId: string | null;
  attachments: readonly SafeAttachmentMetadata[];
  channel: ConversationChannel;
  pendingOperationIds?: readonly string[];
}>;

export type PlannedOperation = Readonly<{ name: string; kind: 'read' | 'mutation' }>;
export type TurnPlan = Readonly<{
  version: '2';
  mode: 'read' | 'mutation-proposal' | 'confirmation' | 'cancel' | 'advice' | 'conversation' | 'unsupported';
  domain: 'accounts' | 'transactions' | 'cards' | 'payables' | 'budgets' | 'goals' | 'categories' | 'memory' | 'web' | 'general';
  skillNames: readonly string[];
  requestedOperations: readonly PlannedOperation[];
  missingFields: readonly string[];
  ambiguity: string | null;
  confidence: number;
}>;

export type MutationPolicy = Readonly<{
  capability: 'financial.read';
  writeAuthorized: false;
  approvalRequired: true;
}>;

export type TurnResult = Readonly<{
  input: TurnInput;
  plan: TurnPlan;
  policy: MutationPolicy;
  mutation?: Readonly<{ operationId: string; status: 'proposed' | 'succeeded' }>;
  /** Explicit clarification outcome (SPEC §7.8-ready): no proposal exists. */
  clarification?: Readonly<{ missingFields: readonly string[]; text: string }>;
  response?: Readonly<{ text: string }>;
}>;
export type TurnResponseProvider = (input: TurnInput, plan: TurnPlan) => Promise<string>;
export type AuthenticatedIdentity = Readonly<{
  actorId: string;
  workspaceId: string;
  role: 'owner' | 'member';
  deviceId?: string | null;
}>;

type Body = { text?: unknown; content?: unknown; intentionId?: unknown; traceId?: unknown; attachments?: unknown; pendingOperationIds?: unknown; [key: string]: unknown };

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
  }
  return value;
};

const normalize = (body: Body, identity: AuthenticatedIdentity, channel: ConversationChannel): TurnInput => {
  const textValue = typeof body.text === 'string' ? body.text : typeof body.content === 'string' ? body.content : '';
  const text = scrubForPersistence(textValue.trim());
  if (!text) throw new Error('agent.invalid_message');
  const intentionId = typeof body.intentionId === 'string' && body.intentionId.trim() ? body.intentionId.trim() : `intent-${Date.now()}`;
  const traceId = typeof body.traceId === 'string' && body.traceId.trim() ? body.traceId.trim() : intentionId;
  if (intentionId.length > 128 || traceId.length > 128) throw new Error('agent.invalid_message');
  const attachments = Array.isArray(body.attachments)
    ? body.attachments.filter((item): item is SafeAttachmentMetadata => !!item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string')
      .map((item) => freeze({ name: item.name, ...(typeof item.type === 'string' ? { type: item.type } : {}), ...(typeof item.size === 'number' ? { size: item.size } : {}) }))
    : [];
  const pendingOperationIds = Array.isArray(body.pendingOperationIds)
    ? body.pendingOperationIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '').map((id) => id.trim())
    : undefined;
  return freeze({
    intentionId,
    traceId,
    text,
    actorId: identity.actorId,
    workspaceId: identity.workspaceId,
    role: identity.role,
    deviceId: identity.deviceId ?? null,
    attachments: freeze(attachments),
    channel,
    ...(pendingOperationIds ? { pendingOperationIds: freeze(pendingOperationIds) } : {}),
  });
};

export const normalizeRestTurn = (body: Body, identity: AuthenticatedIdentity): TurnInput => normalize(body, identity, 'pwa-rest');
export const normalizeSdkTurn = (body: Body, identity: AuthenticatedIdentity): TurnInput => normalize(body, identity, 'sdk');
export const normalizeBrokerTurn = (body: Body, identity: AuthenticatedIdentity): TurnInput => normalize(body, identity, 'broker');

export class ConversationOrchestrator {
  constructor(private readonly dependencies: {
    plan?: (input: TurnInput) => TurnPlan;
    mutationApiClient?: MutationApiClient;
    /** Authoritative entity lists (accounts/categories). Absent = fail closed. */
    entityReader?: EntityReader;
    responseProvider?: TurnResponseProvider;
    /** Read-path evidence source (EvidenceCollector). Absent = legacy pass-through. */
    evidenceProvider?: (input: TurnInput, plan: TurnPlan) => Promise<EvidenceEnvelope | null>;
    /** ONE structured correction retry for unsupported grounded claims. */
    correctionProvider?: (input: TurnInput, plan: TurnPlan, unsupportedClaims: readonly string[]) => Promise<string | null>;
    /** Sanitized lifecycle event sink (defaults to emitSanitizedEvent). */
    events?: (eventType: string, fields: Record<string, unknown>) => void;
  } = {}) {}

  private emit(eventType: string, fields: Record<string, unknown>): void {
    try {
      (this.dependencies.events ?? emitSanitizedEvent)(eventType, fields);
    } catch {
      // Observability must never break the turn.
    }
  }

  private renderDeterministicFromEvidence(plan: TurnPlan, envelope: EvidenceEnvelope): string | null {
    const ok = envelope.items.filter((item) => item.status === 'ok').map((item) => item.data);
    if (ok.length === 0) return null;
    for (const data of ok) {
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const record = data as Record<string, unknown>;
        if (typeof record.balanceCents === 'number' && typeof record.accountName === 'string') {
          return renderBalance({ accountName: record.accountName, balanceCents: record.balanceCents });
        }
      }
    }
    const lists = ok.filter(Array.isArray);
    if (plan.domain === 'transactions' || lists.length > 0) {
      for (const list of lists) {
        const rendered = renderStatement(list as readonly unknown[], 'extrato');
        if (rendered !== renderEmpty('extrato')) return rendered;
      }
      if (plan.domain === 'transactions') return renderEmpty('extrato');
    }
    return null;
  }

  /** Read path: deterministic render when evidence allows, else grounded provider text with ONE retry. */
  private async runGroundedRead(input: TurnInput, plan: TurnPlan, startedAt: number, base: { input: TurnInput; plan: TurnPlan; policy: MutationPolicy }): Promise<TurnResult> {
    const envelope = await this.dependencies.evidenceProvider!(input, plan);
    if (!envelope) {
      if (!this.dependencies.responseProvider) return freeze(base);
      // No evidence: legacy pass-through (provider failures still propagate).
      const text = await this.dependencies.responseProvider(input, plan);
      this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
      return freeze({ ...base, response: freeze({ text }) });
    }
    const deterministic = this.renderDeterministicFromEvidence(plan, envelope);
    if (deterministic !== null) {
      this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
      return freeze({ ...base, response: freeze({ text: deterministic }) });
    }
    if (!this.dependencies.responseProvider) {
      this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
      return freeze({ ...base, response: freeze({ text: renderUnavailable(plan.domain) }) });
    }
    // Provider failures are operational, never a fabricated success.
    const text = await this.dependencies.responseProvider(input, plan);
    const grounded = await createGroundedResponseWithRetry(text, envelope, {
      fallbackSubject: plan.domain,
      ...(this.dependencies.correctionProvider ? { retry: (claims) => this.dependencies.correctionProvider!(input, plan, claims) } : {}),
      sink: (eventType, fields) => this.emit(eventType, fields),
      intentionId: input.intentionId,
      traceId: input.traceId,
    });
    this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', grounded: grounded.grounded, latencyMs: Date.now() - startedAt });
    return freeze({ ...base, response: freeze({ text: grounded.text }) });
  }

  async runTurn(input: TurnInput): Promise<TurnResult> {
    const startedAt = Date.now();
    this.emit('turn.started', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel });
    const plan = this.dependencies.plan?.(input) ?? routeIntent(input.text);
    if (plan.version !== '2' || plan.skillNames.length > 2 || plan.requestedOperations.length > 4 || plan.requestedOperations.some((operation) => plan.mode === 'read' && operation.kind === 'mutation')) {
      this.emit('plan.rejected', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, status: 'rejected' });
      this.emit('turn.failed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, status: 'failed', error: 'agent.invalid_turn_plan' });
      throw new Error('agent.invalid_turn_plan');
    }
    this.emit('plan.validated', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode });
    const policy = freeze({ capability: 'financial.read' as const, writeAuthorized: false as const, approvalRequired: true as const });
    const result: { input: TurnInput; plan: TurnPlan; policy: MutationPolicy; mutation?: { operationId: string; status: 'proposed' | 'succeeded' }; response?: { text: string } } = { input, plan: freeze(plan), policy };
    const client = this.dependencies.mutationApiClient;
    // A proposal may never fall through to a generative response when the
    // channel was unable to construct its narrowly-scoped API client (for
    // example, a missing device binding). This keeps every mutation intent on
    // the same pipeline and fails closed without reviving a V1 relay path.
    if (plan.mode === 'mutation-proposal' && !client) {
      return freeze({ ...result, response: freeze({ text: 'Não foi possível preparar a operação com segurança. A sessão precisa de um dispositivo autenticado.' }) });
    }
    if (plan.mode === 'mutation-proposal' && client) {
      const parsed = parseFinancialMutation(input.text);
      if (parsed.kind === 'none') {
        // SPEC §7.6: missing amount/date is a real missing field, never [].
        const missing = parsed.reason === 'missing_amount' ? ['amount'] : [...plan.missingFields];
        const blockedPlan = freeze({ ...plan, missingFields: freeze([...missing]) });
        const text = parsed.reason === 'missing_amount'
          ? 'Não identifiquei o valor a registrar. Informe o valor e a descrição.'
          : 'Não foi possível preparar a mutação com segurança. Esclareça valor e descrição.';
        this.emit('mutation.blocked', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'blocked' });
        this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
        return freeze({ ...result, plan: blockedPlan, clarification: freeze({ missingFields: blockedPlan.missingFields, text }), response: freeze({ text }) });
      }
      // SPEC §7.1/§7.2/§7.3 (H-01): resolve accountId/categoryId against
      // authoritative reads BEFORE any proposal. Incomplete args clarify;
      // no pending operation is created on this path (T1.3 persists drafts).
      const reader = this.dependencies.entityReader ?? {
        listAccounts: async (): Promise<never> => { throw new Error('agent.entity_reader_missing'); },
        listCategories: async (): Promise<never> => { throw new Error('agent.entity_reader_missing'); },
      };
      const resolution = await resolveMutationEntities(parsed, input.text, reader);
      if (!resolution.complete) {
        const incompletePlan = freeze({ ...plan, missingFields: freeze([...resolution.missingFields]) });
        this.emit('mutation.blocked', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'blocked' });
        this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
        return freeze({ ...result, plan: incompletePlan, clarification: freeze({ missingFields: incompletePlan.missingFields, text: resolution.clarification }), response: freeze({ text: resolution.clarification }) });
      }
      const identity: MutationIdentity = { workspaceId: input.workspaceId, actorId: input.actorId, deviceId: input.deviceId ?? (() => { throw new Error('mutation.device_required'); })() };
      const proposal = await client.propose({
          tool: parsed.kind === 'income' ? 'transactions.income.create' : 'transactions.expense.create',
        normalizedArgs: {
          amountCents: parsed.amountCents,
          description: parsed.description,
          date: parsed.date,
          accountId: resolution.accountId,
          categoryId: resolution.categoryId,
        },
        summary: parsed.description,
        identity,
        idempotencyKey: input.intentionId,
      });
      return freeze({ ...result, mutation: freeze({ operationId: proposal.id, status: 'proposed' }), response: freeze({ text: renderMutationResult('proposed', proposal.summary) }) });
    }
    if (plan.mode === 'confirmation' && client) {
      const decision = resolveConfirmation(input.text, input.pendingOperationIds ?? []);
      if (decision.kind !== 'confirm' || !decision.operationId) {
        this.emit('approval.rejected', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'rejected' });
        this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
        return freeze({ ...result, response: freeze({ text: 'Não há uma única operação pendente para confirmar.' }) });
      }
      const identity: MutationIdentity = { workspaceId: input.workspaceId, actorId: input.actorId, deviceId: input.deviceId ?? (() => { throw new Error('mutation.device_required'); })() };
      this.emit('approval.requested', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'requested' });
      try {
        const confirmation = await client.confirm(decision.operationId, identity);
        const execution = await client.execute({ operationId: confirmation.operationId, attestation: confirmation.attestation, identity });
        this.emit('approval.confirmed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'confirmed' });
        this.emit('mutation.executed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'succeeded', latencyMs: Date.now() - startedAt });
        this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
        return freeze({ ...result, mutation: freeze({ operationId: execution.operationId, status: 'succeeded' }), response: freeze({ text: renderMutationResult('succeeded') }) });
      } catch {
        this.emit('mutation.blocked', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'blocked' });
        this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
        return freeze({ ...result, response: freeze({ text: renderMutationResult('failed') }) });
      }
    }
    if (plan.mode === 'cancel') {
      this.emit('approval.rejected', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'rejected' });
      this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
      return freeze({ ...result, response: freeze({ text: renderMutationResult('cancelled') }) });
    }
    if (plan.mode === 'read' && this.dependencies.evidenceProvider) {
      // Evidence-backed read: deterministic render or validated grounded text.
      return this.runGroundedRead(input, plan, startedAt, result);
    }
    const responseText = plan.mode === 'read'
      ? `Consulta preparada para ${plan.domain}.`
      : plan.mode === 'advice' || plan.mode === 'conversation'
        ? 'Posso ajudar com consultas e orientações financeiras. Descreva o que você precisa.'
        : plan.mode === 'unsupported'
          ? 'Não consegui identificar a solicitação com segurança. Explique a consulta ou operação desejada.'
          : 'Não foi possível concluir a solicitação com segurança.';
    if (this.dependencies.responseProvider) {
      // A provider failure is operational, not a successful deterministic
      // response. Adapters map the typed error to their channel contract;
      // swallowing it here would publish a fabricated success after an
      // authority, revocation, or inference failure.
      try {
        const text = await this.dependencies.responseProvider(input, plan);
        this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
        return freeze({ ...result, response: freeze({ text }) });
      } catch (error) {
        this.emit('turn.failed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'failed', error });
        throw error;
      }
    }
    this.emit('turn.completed', { intentionId: input.intentionId, traceId: input.traceId, channel: input.channel, domain: plan.domain, mode: plan.mode, status: 'completed', latencyMs: Date.now() - startedAt });
    return freeze(result);
  }
}
