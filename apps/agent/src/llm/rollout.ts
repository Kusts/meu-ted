import type { RuntimeSnapshot } from './runtime-config-client.js';

/**
 * H-03: rollout / canary / security-epoch enforcement, applied per turn by
 * the executor (never serialized-only).
 *
 * - `disabled` blocks new inferences (fail-closed).
 * - `canary` serves the active pair only to the deterministic cohort
 *   (explicit allowlist by workspace/actor/intention, else a stable
 *   workspace:actor percentage bucket); everyone else is promoted to the
 *   fallback pair — or fails closed when no usable fallback exists.
 * - `all` serves the active pair.
 * - The security epoch is re-verified against the authority every turn: a
 *   bumped epoch invalidates the cached snapshot and aborts the turn so
 *   already-queued/streaming work cannot keep running on revoked config.
 * - An unreachable authority keeps the cached snapshot (availability over
 *   strictness on transient failure; the caller logs). An unknown mode
 *   fails closed.
 */

export type TurnSnapshot = {
  intention_id: string;
  version: number;
  provider_id: string;
  model_id: string;
  protocol: string;
  rollout_percentage: number;
  security_epoch: number;
  fallback_provider_id?: string | null;
  fallback_model_id?: string | null;
  model_name?: string | null;
  fallback_model_name?: string | null;
  created_at: string;
};

export type RolloutMode = 'disabled' | 'canary' | 'all';

export type TurnAuthorizationError = Error & {
  code: 'agent.provider_not_configured' | 'agent.security_epoch_changed';
  status: number;
};

const turnError = (
  code: TurnAuthorizationError['code'],
  status: number,
  message: string,
): TurnAuthorizationError => Object.assign(new Error(message), { code, status });

/** Deterministic 32-bit FNV-1a hash (stable across runtimes for cohorting). */
export const cohortHash = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const selectRolloutCohort = (input: {
  mode: RolloutMode;
  percentage: number;
  allowlist: string[];
  workspaceId: string;
  actorId: string;
  intentionId: string;
}): boolean => {
  if (input.mode !== 'canary') return input.mode === 'all';
  const allow = input.allowlist ?? [];
  if (
    allow.includes(input.workspaceId) ||
    allow.includes(input.actorId) ||
    allow.includes(input.intentionId)
  ) {
    return true;
  }
  const pct = Number.isFinite(input.percentage)
    ? Math.min(100, Math.max(0, input.percentage))
    : 0;
  if (pct >= 100) return true;
  if (pct <= 0) return false;
  return cohortHash(`${input.workspaceId}:${input.actorId}`) % 100 < pct;
};

export const authorizeTurnExecution = async <S extends TurnSnapshot>(opts: {
  snapshot: S;
  workspaceId: string;
  actorId: string;
  intentionId: string;
  fetchConfig: () => Promise<RuntimeSnapshot>;
  deleteCachedSnapshot?: () => void | Promise<void>;
  onAuthorityUnreachable?: (err: unknown) => void;
}): Promise<S> => {
  let fresh: RuntimeSnapshot;
  try {
    fresh = await opts.fetchConfig();
  } catch (err) {
    // Transient authority failure: keep serving the cached snapshot rather
    // than denying every turn during an API blip. The caller logs it.
    opts.onAuthorityUnreachable?.(err);
    return opts.snapshot;
  }

  if (fresh.securityEpoch !== opts.snapshot.security_epoch) {
    try {
      await opts.deleteCachedSnapshot?.();
    } catch {
      // Best effort: the abort below is what enforces the revocation.
    }
    throw turnError(
      'agent.security_epoch_changed',
      409,
      'Configuração de IA revogada durante o turno (security epoch). Tente de novo.',
    );
  }

  const mode = fresh.activeRolloutMode as RolloutMode;
  if (mode === 'disabled') {
    throw turnError(
      'agent.provider_not_configured',
      503,
      'Inferência desativada pela configuração atual (rollout disabled).',
    );
  }
  if (mode !== 'all' && mode !== 'canary') {
    throw turnError(
      'agent.provider_not_configured',
      503,
      `Modo de rollout desconhecido (${String(fresh.activeRolloutMode)}).`,
    );
  }

  const inCohort =
    mode === 'all' ||
    selectRolloutCohort({
      mode: 'canary',
      percentage: fresh.activeRolloutPercentage,
      allowlist: fresh.canaryAllowlist ?? [],
      workspaceId: opts.workspaceId,
      actorId: opts.actorId,
      intentionId: opts.intentionId,
    });
  if (inCohort) return opts.snapshot;

  // Outside the canary cohort the stable fallback pair serves the turn
  // (promoted to primary, with no second fallback leg).
  if (
    opts.snapshot.fallback_provider_id &&
    opts.snapshot.fallback_model_id
  ) {
    return {
      ...opts.snapshot,
      provider_id: opts.snapshot.fallback_provider_id,
      model_id: opts.snapshot.fallback_model_id,
      model_name: opts.snapshot.fallback_model_name ?? null,
      fallback_provider_id: null,
      fallback_model_id: null,
      fallback_model_name: null,
    };
  }
  throw turnError(
    'agent.provider_not_configured',
    503,
    'Turno fora da coorte canário sem fallback usável.',
  );
};
