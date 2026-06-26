"use client";

import { useAppState } from "@/lib/state/app-state-context";
import type { DomainKey } from "@/lib/state/snapshot-store";

interface StaleBannerProps {
  /** Which domains this screen depends on. Banner shows if any is served from snapshot. */
  domains: DomainKey[];
}

export function StaleBanner({ domains }: StaleBannerProps) {
  const { sync } = useAppState();
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
      <div className="mx-5 mb-3 rounded-[12px] bg-fill-light px-4 py-2.5 text-[12px] font-semibold text-text-secondary">
        ⚠ Dados desatualizados — modo somente leitura.
        {when ? ` Última sincronização: ${when}.` : ""}
      </div>
    );
  }

  return (
    <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
      ⚠ Não foi possível carregar os dados — backend indisponível (modo
      somente leitura).
    </div>
  );
}
