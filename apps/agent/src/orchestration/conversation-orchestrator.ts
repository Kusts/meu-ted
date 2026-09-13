import { scrubForPersistence } from '../privacy/dlp.js';
import { parseFinancialMutation } from '../mutations/financial-parser.js';
import { resolveConfirmation } from '../mutations/confirmation-resolver.js';
import type { MutationApiClient, MutationIdentity } from '../mutations/mutation-api-client.js';
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
    responseProvider?: TurnResponseProvider;
  } = {}) {}

  async runTurn(input: TurnInput): Promise<TurnResult> {
    const plan = this.dependencies.plan?.(input) ?? routeIntent(input.text);
    if (plan.version !== '2' || plan.skillNames.length > 2 || plan.requestedOperations.length > 4 || plan.requestedOperations.some((operation) => plan.mode === 'read' && operation.kind === 'mutation')) {
      throw new Error('agent.invalid_turn_plan');
    }
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
      if (parsed.kind === 'none') return freeze({ ...result, response: freeze({ text: 'Não foi possível preparar a mutação com segurança. Esclareça valor e descrição.' }) });
      const identity: MutationIdentity = { workspaceId: input.workspaceId, actorId: input.actorId, deviceId: input.deviceId ?? (() => { throw new Error('mutation.device_required'); })() };
      const proposal = await client.propose({
          tool: parsed.kind === 'income' ? 'transactions.income.create' : 'transactions.expense.create',
        normalizedArgs: {
          amountCents: parsed.amountCents,
          description: parsed.description,
          date: parsed.date,
          ...(parsed.categoryQuery ? (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.categoryQuery)
            ? { categoryId: parsed.categoryQuery }
            : { categoryQuery: parsed.categoryQuery }) : {}),
        },
        summary: parsed.description,
        identity,
        idempotencyKey: input.intentionId,
      });
      return freeze({ ...result, mutation: freeze({ operationId: proposal.id, status: 'proposed' }), response: freeze({ text: `Proposta: ${proposal.summary}. Confirma?` }) });
    }
    if (plan.mode === 'confirmation' && client) {
      const decision = resolveConfirmation(input.text, input.pendingOperationIds ?? []);
      if (decision.kind !== 'confirm' || !decision.operationId) return freeze({ ...result, response: freeze({ text: 'Não há uma única operação pendente para confirmar.' }) });
      const identity: MutationIdentity = { workspaceId: input.workspaceId, actorId: input.actorId, deviceId: input.deviceId ?? (() => { throw new Error('mutation.device_required'); })() };
      try {
        const confirmation = await client.confirm(decision.operationId, identity);
        const execution = await client.execute({ operationId: confirmation.operationId, attestation: confirmation.attestation, identity });
        return freeze({ ...result, mutation: freeze({ operationId: execution.operationId, status: 'succeeded' }), response: freeze({ text: 'Lançamento registrado com sucesso.' }) });
      } catch {
        return freeze({ ...result, response: freeze({ text: 'Não foi possível concluir a operação.' }) });
      }
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
      return freeze({ ...result, response: freeze({ text: await this.dependencies.responseProvider(input, plan) }) });
    }
    return freeze(result);
  }
}
