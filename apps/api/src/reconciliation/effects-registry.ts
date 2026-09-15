/**
 * Server-side Mutation Effects Registry (SPEC §15.1.1, T3.2).
 *
 * Single source of truth is the shared workspace package
 * `@pi-finance/llm-contracts` (MUTATION_EFFECTS_REGISTRY + resolvers):
 * this module only delegates and adds API-side receipt construction.
 * affectedTargets are NEVER derived from the LLM, the PWA, or
 * component-level if/else — only from the registry below.
 */
import { randomUUID } from 'node:crypto';
import {
  assertAllMutationKindsRegistered,
  MUTATION_EFFECTS_REGISTRY,
  mutationReceiptSchema,
  resolveMutationEffects,
  type MutationKind,
  type MutationReceipt,
  type RefreshTarget,
  type TedApprovalTool,
} from '@pi-finance/llm-contracts';

// Fail fast: every MUTATION_KIND must be registered (or explicitly
// no-refresh) before the API may return success with a receipt.
assertAllMutationKindsRegistered();

/**
 * Deterministic refresh targets for a mutation kind. Throws for unknown
 * kinds — never an empty silent refresh.
 */
export const resolveEffects = (kind: string): RefreshTarget[] => {
  const entry = resolveMutationEffects(kind as MutationKind);
  return [...entry.affectedTargets];
};

/**
 * Builds a normal-write receipt (SPEC §15.1): API-generated mutationId,
 * registry-derived targets, NO operationId. TED approval-tool kinds without
 * an operationId fail schema validation — use buildTedReceipt instead.
 */
export const buildMutationReceipt = (
  kind: MutationKind,
  entity?: { type: string; id: string },
): MutationReceipt => {
  const receipt: MutationReceipt = {
    mutationId: randomUUID(),
    mutationKind: kind,
    status: 'succeeded',
    affectedTargets: resolveEffects(kind),
  };
  if (entity !== undefined) receipt.entity = entity;
  // parse validates (TED kinds require operationId); the cast bridges zod's
  // optional-inferred output to the exactOptionalPropertyTypes interface.
  return mutationReceiptSchema.parse(receipt) as MutationReceipt;
};

/**
 * Builds a TED-path receipt (SPEC §15.1): same as buildMutationReceipt
 * plus the origin PendingOperation id. Throws when the kind requires an
 * operationId and none is given (schema-level identity rule).
 */
export const buildTedReceipt = (
  tool: TedApprovalTool | MutationKind,
  operationId: string,
  entity?: { type: string; id: string },
): MutationReceipt => {
  const receipt: MutationReceipt = {
    mutationId: randomUUID(),
    mutationKind: tool as MutationKind,
    status: 'succeeded',
    affectedTargets: resolveEffects(tool),
    operationId,
  };
  receipt.entity = entity ?? { type: 'transaction', id: operationId };
  return mutationReceiptSchema.parse(receipt) as MutationReceipt;
};

export type BodyWithReceipt<T> = T extends Record<string, unknown>
  ? T & { receipt: MutationReceipt }
  : { data: T; receipt: MutationReceipt };

/**
 * Attaches a normal-write receipt additively to a route response body.
 * Plain objects gain a `receipt` key (existing fields untouched);
 * non-object bodies are wrapped as `{ data, receipt }`.
 */
export const attachMutationReceipt = <T>(
  body: T,
  kind: MutationKind,
  entity?: { type: string; id: string },
): BodyWithReceipt<T> => {
  const receipt = buildMutationReceipt(kind, entity);
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    return { ...(body as Record<string, unknown>), receipt } as BodyWithReceipt<T>;
  }
  return { data: body, receipt } as BodyWithReceipt<T>;
};

export { MUTATION_EFFECTS_REGISTRY };
export type { MutationKind, MutationReceipt, RefreshTarget };
