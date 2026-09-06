"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useIsOverlayOpen } from "./overlay-a11y";
import { useSheet } from "@/lib/sheet-context";

/**
 * F4 — pull-to-refresh hand-rolled (sem libs).
 *
 * Decisão do debate: as páginas rolam no window/body (nenhum container de
 * scroll próprio), então observamos touchstart/touchmove/touchend no window
 * e disparamos `onRefresh` quando o gesto nasce no topo (`window.scrollY
 * === 0`), com dominância vertical e distância >= ~70px. Nenhum
 * `preventDefault` antes do threshold (listener `passive:false` só passa a
 * prevenir após armar, preservando o bounce nativo do iOS e a rolagem).
 * `overscroll-behavior-y: none` é aplicado ao <html> SOMENTE durante o pull
 * ativo e restaurado em seguida.
 *
 * Guardas: `enabled`, `(pointer: coarse)`, overlay aberto (lockCount),
 * sheet de transação aberta, multi-toque, gesto com dominância horizontal
 * (pertence ao SwipeNav). `prefers-reduced-motion`: o refresh dispara
 * normalmente, mas o indicador é estático (sem spin/transição).
 */

export const PULL_THRESHOLD_PX = 70;
export const PULL_MAX_PX = 120;
const PULL_DOMINANCE_RATIO = 1.2;

export interface UsePullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
}

export interface UsePullToRefreshState {
  /** Deslocamento atual do indicador (0 quando ocioso). */
  pullDistance: number;
  /** True enquanto a promise de `onRefresh` está pendente. */
  isRefreshing: boolean;
  /** Alias de `isRefreshing` (contrato da API do hook). */
  refreshing: boolean;
}

function coarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface PullMark {
  y: number;
  x: number;
}

export function usePullToRefresh({
  onRefresh,
  enabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshState {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const overlayOpen = useIsOverlayOpen();
  const { sheetKind } = useSheet();
  const startRef = useRef<PullMark | null>(null);
  const armedRef = useRef(false);
  const refreshingRef = useRef(false);
  // Refs evitam listeners obsoletos sem religar touch handlers.
  const liveRef = useRef({ onRefresh, enabled, overlayOpen, sheetKind });
  useEffect(() => {
    liveRef.current = { onRefresh, enabled, overlayOpen, sheetKind };
  });

  const restoreOverscroll = useCallback(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.removeProperty("overscroll-behavior-y");
    }
  }, []);

  const lockOverscroll = useCallback(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty("overscroll-behavior-y", "none");
    }
  }, []);

  useEffect(() => {
    function eligible(): boolean {
      const { enabled, overlayOpen, sheetKind } = liveRef.current;
      return (
        enabled &&
        coarsePointer() &&
        !overlayOpen &&
        sheetKind === null &&
        !refreshingRef.current &&
        window.scrollY <= 0
      );
    }

    function onTouchStart(e: TouchEvent) {
      startRef.current = null;
      armedRef.current = false;
      if (!eligible()) return;
      if (e.touches.length > 1) return;
      const t = e.touches[0];
      if (!t) return;
      startRef.current = { y: t.clientY, x: t.clientX };
    }

    function onTouchMove(e: TouchEvent) {
      const start = startRef.current;
      if (!start || !eligible()) return;
      if (e.touches.length > 1) {
        startRef.current = null;
        return;
      }
      const t = e.touches[0];
      if (!t) return;
      const dy = t.clientY - start.y;
      const dx = t.clientX - start.x;
      // Gesto horizontal pertence ao SwipeNav/carrosséis: aborta o pull.
      if (Math.abs(dx) > Math.abs(dy) * PULL_DOMINANCE_RATIO) {
        startRef.current = null;
        setPullDistance(0);
        return;
      }
      if (dy <= 0) {
        setPullDistance(0);
        return;
      }
      setPullDistance(Math.min(dy, PULL_MAX_PX));
      if (dy >= PULL_THRESHOLD_PX) {
        armedRef.current = true;
        // Só aqui passamos a prevenir: contém o rubber-band durante o pull.
        if (e.cancelable) e.preventDefault();
        lockOverscroll();
      }
    }

    async function onTouchEnd() {
      const start = startRef.current;
      startRef.current = null;
      restoreOverscroll();
      if (!start) {
        setPullDistance(0);
        return;
      }
      const armed = armedRef.current;
      armedRef.current = false;
      if (!armed || !eligible()) {
        setPullDistance(0);
        return;
      }
      // Disparo: haptics leve + refresh; indicador assume até concluir.
      try {
        if (
          typeof navigator !== "undefined" &&
          typeof navigator.vibrate === "function"
        ) {
          navigator.vibrate(10);
        }
      } catch {
        // Haptics é best-effort.
      }
      refreshingRef.current = true;
      setIsRefreshing(true);
      try {
        await liveRef.current.onRefresh();
      } catch {
        // Erro de refresh não trava o gesto; a página exibe seu próprio erro.
      } finally {
        refreshingRef.current = false;
        setIsRefreshing(false);
        setPullDistance(0);
      }
    }

    function onTouchCancel() {
      startRef.current = null;
      armedRef.current = false;
      restoreOverscroll();
      setPullDistance(0);
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchCancel);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      restoreOverscroll();
    };
  }, [restoreOverscroll, lockOverscroll]);

  return { pullDistance, isRefreshing, refreshing: isRefreshing };
}

export function PullToRefreshIndicator({
  state,
}: {
  state: UsePullToRefreshState;
}) {
  const [reducedMotion] = useState(() => prefersReducedMotion());
  const { pullDistance, isRefreshing } = state;
  if (!isRefreshing && pullDistance <= 0) return null;
  const armed = pullDistance >= PULL_THRESHOLD_PX;
  const height = isRefreshing ? 56 : Math.min(pullDistance, PULL_MAX_PX);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 overflow-hidden text-text-muted"
      style={{
        height,
        opacity: isRefreshing ? 1 : Math.min(1, pullDistance / PULL_THRESHOLD_PX),
        transition: reducedMotion ? "none" : "height 200ms ease-out",
      }}
    >
      {isRefreshing ? (
        <>
          <Loader2
            size={18}
            strokeWidth={2.4}
            aria-hidden="true"
            className={reducedMotion ? "text-primary" : "animate-spin text-primary"}
          />
          <span className="text-[12px] font-bold text-text-secondary">
            Atualizando…
          </span>
        </>
      ) : (
        <span className="text-[12px] font-bold text-text-secondary">
          {armed ? "Solte para atualizar" : "Puxe para atualizar"}
        </span>
      )}
    </div>
  );
}

export default usePullToRefresh;
