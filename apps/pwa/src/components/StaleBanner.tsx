"use client";

import { useState } from "react";
import { useAppState } from "@/lib/state/app-state-context";
import type { DomainKey } from "@/lib/state/snapshot-store";

interface StaleBannerProps {
  /** Which domains this screen depends on. Banner shows if any is served from snapshot. */
  domains: DomainKey[];
  /** Optional callback when user dismisses the snapshot banner. */
  onDismiss?: () => void;
  /**
   * Optional retry fallback honored ONLY by the `unavailable` variant
   * (hard "could not load", no cached data). Ignored by the `snapshot`
   * variant, which always owns its retry via `refreshDomains(snapshotted)`
   * and never reloads — so a legacy/custom callback can never bypass the
   * scoped domain refresh.
   */
  onRetry?: () => void;
  /**
   * Optional post-domain hook honored ONLY by the `snapshot` variant:
   * invoked strictly AFTER `refreshDomains(snapshotted)` resolves `true`
   * (all affected domains live). Never invoked when the domain refresh
   * reports no live data or rejects — the snapshot banner keeps its
   * read-only error and no optimistic summary is attempted. A rejecting
   * hook never triggers a reload; the owner (e.g. Home) surfaces its own
   * summary error so failure state survives this banner unmounting when
   * domains go live.
   */
  onSnapshotRefresh?: () => Promise<unknown>;
}

function reloadApp() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export function StaleBanner({ domains, onDismiss, onSnapshotRefresh, ...rest }: StaleBannerProps) {
  const { sync, refreshDomains } = useAppState();
  // Item 7: snapshot retry state — scoped re-fetch without reload. Hooks stay
  // unconditional (before any early return) so SSR/hydration order is stable.
  const [snapshotRetrying, setSnapshotRetrying] = useState(false);
  const [snapshotRetryFailed, setSnapshotRetryFailed] = useState(false);
  const snapshotted = domains.filter((d) => sync[d].source === "snapshot");
  const unavailable = domains.filter((d) => sync[d].source === "unavailable");
  if (snapshotted.length === 0 && unavailable.length === 0) return null;

  // Prefer the "stale snapshot" message when we have cached data to show;
  // otherwise it's a hard "could not load" (unavailable, empty).
  if (snapshotted.length > 0) {
    const oldest = snapshotted
      .map((d) => sync[d].syncedAt)
      .filter((s): s is string => s !== null)
      .sort()[0];
    const when = oldest
      ? new Date(oldest).toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : null;
    // Item 7: snapshot retry re-fetches ONLY the snapshotted domains via
    // refreshDomains. Offline/failure keeps the cached read-only banner and
    // surfaces a clear accessible error — never window.location.reload(), so
    // the offline snapshot is never lost to a reload loop. On full domain
    // success the optional onSnapshotRefresh post-domain hook recovers
    // owner-level derived state (e.g. Home's authoritative dashboardSummary);
    // it is skipped entirely when domains fail/offline, and its own failure
    // never reloads nor sets the snapshot-domain error (the owner surfaces
    // summary failure so state survives this banner unmounting to live).
    const handleSnapshotRetry = async () => {
      if (snapshotRetrying) return;
      // Item 7 fix: snapshot ALWAYS refreshes via refreshDomains, even when
      // a legacy/custom onRetry prop exists (e.g. HomePage router.refresh).
      // onRetry is honored only by the unavailable variant below.
      if (typeof refreshDomains !== "function") {
        setSnapshotRetryFailed(true);
        return;
      }
      setSnapshotRetrying(true);
      setSnapshotRetryFailed(false);
      try {
        const refreshed = await refreshDomains(snapshotted);
        if (!refreshed) {
          setSnapshotRetryFailed(true);
          return;
        }
        // All affected domains are live — recover owner derived state.
        if (typeof onSnapshotRefresh === "function") {
          try {
            await onSnapshotRefresh();
          } catch {
            // Owner surfaces its own summary error (Home keeps failure state
            // after this banner unmounts); never reload, never flag the
            // already-live domains as failed.
          }
        }
        // On success the refreshed domains dispatch DOMAIN_LIVE, which flips
        // sync source to "live" and unmounts this banner — no explicit
        // dismiss needed and no reload.
      } catch {
        setSnapshotRetryFailed(true);
      } finally {
        setSnapshotRetrying(false);
      }
    };
    return (
      <div
        data-testid="stale-banner"
        data-variant="snapshot"
        role="status"
        className="mx-5 mb-3 flex items-center justify-between gap-2 rounded-[12px] bg-info-tint px-4 py-2.5 text-[12px] font-semibold text-info"
      >
        <span className="min-w-0 flex-1">
          <span aria-hidden="true">⏱</span>{" "}
          {when
            ? `Dados de ${when} — modo leitura.`
            : "Dados em cache — modo leitura."}
          {snapshotRetryFailed && (
            <span role="alert" className="mt-1 block font-normal">
              Sem conexão — continuamos mostrando os dados em cache. Tente
              novamente quando estiver online.
            </span>
          )}
        </span>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={() => void handleSnapshotRetry()}
            disabled={snapshotRetrying}
            aria-busy={snapshotRetrying}
            aria-label="Tentar novamente"
            className="rounded-[8px] border border-info/40 bg-surface px-2.5 py-1 text-[11px] font-bold text-info transition-colors hover:bg-info/10 disabled:opacity-60"
          >
            {snapshotRetrying ? "Tentando…" : "Tentar novamente"}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dispensar aviso"
              className="flex-none text-[16px] leading-none text-info/60 hover:text-info"
            >
              ×
            </button>
          )}
        </div>
      </div>
    );
  }

  const handleDefaultRetry = async () => {
    try {
      if (typeof refreshDomains !== "function") throw new Error("refresh unavailable");
      const refreshed = await refreshDomains(domains);
      if (!refreshed) reloadApp();
    } catch {
      reloadApp();
    }
  };
  // Unavailable-only contract: onRetry is destructured HERE, after the
  // snapshot branch has returned, so the snapshot path structurally cannot
  // reference the custom callback — it always owns retry via refreshDomains.
  const { onRetry } = rest;
  const handleRetry = onRetry ?? (() => void handleDefaultRetry());
  return (
    <div
      data-testid="stale-banner"
      data-variant="unavailable"
      role="alert"
      className="mx-5 mb-3 flex items-center justify-between gap-2 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger"
    >
      <span className="min-w-0 flex-1">
        <span aria-hidden="true">⚠</span> Não foi possível carregar os dados
        — backend indisponível.
      </span>
      <div className="flex flex-none items-center gap-1">
        <button
          type="button"
          onClick={handleRetry}
          aria-label="Tentar novamente"
          className="rounded-[8px] border border-danger/40 bg-surface px-2.5 py-1 text-[11px] font-bold text-danger transition-colors hover:bg-danger/10"
        >
          Tentar novamente
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dispensar aviso"
            className="flex-none text-[16px] leading-none text-danger/60 hover:text-danger"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
