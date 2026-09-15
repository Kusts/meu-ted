/**
 * MutationReconciler — single reconciliation layer (SPEC §15.2, T3.3).
 *
 * Consumes MutationReceipts from BOTH origins (TED approvals carrying
 * `operationId`, normal writes without) and refreshes only the
 * registry-derived targets. It never derives targets from the LLM and never
 * spreads component-level refresh if/else: the ONLY target source is
 * `receipt.affectedTargets`, falling back to MUTATION_EFFECTS_REGISTRY via
 * `mutationKind` when a given API response does not expose a receipt yet.
 *
 * Refresh capabilities themselves live in AppStateProvider (which owns the
 * fetch + state setters); this module only decides WHAT to refresh and
 * reports per-target failures so the provider can mark domains stale
 * (SPEC §15.5) without ever rolling back the persisted mutation.
 *
 * Bundle budget: imports the zod-free `@pi-finance/llm-contracts/types`
 * subpath only — never the zod `schemas` entry (see bundle-budget.test.ts).
 */
import {
  MUTATION_EFFECTS_REGISTRY,
  REFRESH_TARGETS,
  TED_APPROVAL_TOOLS,
  type MutationKind,
  type MutationReceipt,
  type RefreshTarget,
} from "@pi-finance/llm-contracts/types";

/** SPEC §15.5 — shown when a confirmed mutation's refresh fails. */
export const RECONCILIATION_STALE_MESSAGE =
  "Lançamento registrado, mas não foi possível atualizar todos os dados.";

const VALID_TARGETS = new Set<string>(REFRESH_TARGETS);

/** In-memory seen-set cap: bounds memory while deduping repeated receipts. */
const DEFAULT_MAX_SEEN = 200;

export interface ReconcileInput {
  receipt?: MutationReceipt | null;
  mutationKind?: MutationKind | string;
}

export interface ReconcileResult {
  targets: RefreshTarget[];
  refreshed: RefreshTarget[];
  failed: RefreshTarget[];
  deduped: boolean;
}

/**
 * Resolves the refresh targets for a mutation: the receipt's
 * `affectedTargets` win; without a receipt the registry entry for
 * `mutationKind` is used. Throws for unknown kinds — a mutation without a
 * reconciliation policy is a resolve-time error, never a silent no-op.
 */
export function resolveReconciliationTargets(
  input: ReconcileInput,
): RefreshTarget[] {
  const { receipt, mutationKind } = input;
  if (receipt?.affectedTargets) {
    return receipt.affectedTargets.filter((t): t is RefreshTarget =>
      VALID_TARGETS.has(t),
    );
  }
  if (mutationKind) {
    const entry =
      MUTATION_EFFECTS_REGISTRY[mutationKind as MutationKind];
    if (!entry) {
      throw new Error(
        `MutationReconciler: no effects registered for "${mutationKind}"`,
      );
    }
    return [...entry.affectedTargets];
  }
  throw new Error(
    "MutationReconciler: receipt or mutationKind is required",
  );
}

/**
 * Reads the additively attached receipt from a normal-write response body
 * (API T3.2: `attachMutationReceipt` adds a `receipt` key; `apiFetch`
 * passes bodies through verbatim). Structural check only — full schema
 * validation lives API-side. Returns undefined when the path has no receipt
 * plumbing yet (caller falls back to the mutationKind mapping).
 */
export function extractMutationReceipt(
  body: unknown,
): MutationReceipt | undefined {
  if (body === null || typeof body !== "object") return undefined;
  const receipt = (body as { receipt?: unknown }).receipt;
  if (receipt === null || typeof receipt !== "object") return undefined;
  const r = receipt as Partial<MutationReceipt>;
  if (
    typeof r.mutationId !== "string" ||
    r.mutationId.length === 0 ||
    !Array.isArray(r.affectedTargets)
  ) {
    return undefined;
  }
  return receipt as MutationReceipt;
}

/**
 * Maps a TED pending-operation `operation` string to a registry mutation
 * kind for the approval-success path. Exact V2 approval-tool ids win; a
 * loose income/expense heuristic covers display-level operation labels.
 *
 * T3.3: this is now the DOCUMENTED FALLBACK only — when the Agent relays
 * the real API execution receipt, the reconciler consumes it directly
 * (`{ receipt }`) and this mapping is not used. Without a receipt there is
 * no mutationId, so the reconciler never dedupes the fallback path.
 */
export function resolveTedMutationKind(operation: string): MutationKind {
  const tools = TED_APPROVAL_TOOLS as readonly string[];
  if ((tools as readonly string[]).includes(operation)) {
    return operation as MutationKind;
  }
  if (operation.toLowerCase().includes("income")) {
    return "transactions.income.create";
  }
  return "transactions.expense.create";
}

export interface MutationReconcilerOptions {
  /** Refreshes one target; may reject per target (reported, never thrown). */
  refresh: (target: RefreshTarget) => Promise<void>;
  /** Seen mutationId cap (default 200, oldest evicted first). */
  maxSeen?: number;
}

/**
 * Creates a reconciler with a small in-memory seen-set keyed by
 * `mutationId`. Repeated receipts (approval retry, double delivery) refresh
 * nothing. Refresh failures are collected per target — `reconcile` never
 * throws for them, so callers mark stale instead of rolling back.
 */
export function createMutationReconciler(options: MutationReconcilerOptions): {
  reconcile: (input: ReconcileInput) => Promise<ReconcileResult>;
  /** Refreshes an explicit target list (stale-retry path): no dedup, never throws. */
  reconcileTargets: (
    targets: RefreshTarget[],
  ) => Promise<Pick<ReconcileResult, "targets" | "refreshed" | "failed">>;
} {
  const { refresh, maxSeen = DEFAULT_MAX_SEEN } = options;
  const seen = new Map<string, true>();

  const remember = (mutationId: string): boolean => {
    if (seen.has(mutationId)) return false;
    seen.set(mutationId, true);
    while (seen.size > maxSeen) {
      const oldest = seen.keys().next();
      if (oldest.done) break;
      seen.delete(oldest.value);
    }
    return true;
  };

  const reconcileTargets = async (targets: RefreshTarget[]) => {
    const settled = await Promise.allSettled(
      targets.map((target) => refresh(target)),
    );
    const refreshed: RefreshTarget[] = [];
    const failed: RefreshTarget[] = [];
    settled.forEach((outcome, index) => {
      const target = targets[index] as RefreshTarget;
      if (outcome.status === "fulfilled") refreshed.push(target);
      else failed.push(target);
    });
    return { targets, refreshed, failed };
  };

  const reconcile = async (input: ReconcileInput): Promise<ReconcileResult> => {
    const targets = resolveReconciliationTargets(input);
    const mutationId = input.receipt?.mutationId;
    if (mutationId !== undefined && !remember(mutationId)) {
      return { targets: [], refreshed: [], failed: [], deduped: true };
    }
    const outcome = await reconcileTargets(targets);
    return { ...outcome, deduped: false };
  };

  return { reconcile, reconcileTargets };
}
