"use client";

import { useAppState } from "@/lib/state/app-state-context";
import type { DomainKey } from "@/lib/state/snapshot-store";

interface StaleBannerProps {
  /** Which domains this screen depends on. Banner shows if any is served from snapshot. */
  domains: DomainKey[];
  /** Optional callback when user dismisses the snapshot banner. */
  onDismiss?: () => void;
  /** Optional callback when user taps "Tentar novamente". Falls back to per-domain refresh via refreshDomains, with window.location.reload as last resort. */
  onRetry?: () => void;
}

function reloadApp() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

export function StaleBanner({ domains, onDismiss, onRetry }: StaleBannerProps) {
  const { sync, refreshDomains } = useAppState();
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
        </span>
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
