"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useIsOverlayOpen } from "./overlay-a11y";
import { haptic } from "./haptics";
import { useSheet } from "@/lib/sheet-context";

/**
 * F4 — pull-to-refresh hand-rolled (sem libs), mecânica da spec AGY Onda 2/3 §3.
 *
 * Decisão do debate: as páginas rolam no window/body (nenhum container de
 * scroll próprio), então observamos touchstart/touchmove/touchend no window
 * e disparamos `onRefresh` quando o gesto nasce no topo (`window.scrollY
 * === 0`), com dominância vertical. Distância exibida com damping linear
 * 0.45 (máx 80px); threshold 64px. Nenhum `preventDefault` antes do
 * threshold (listener `passive:false` só passa a prevenir após armar,
 * preservando o bounce nativo do iOS e a rolagem).
 * `overscroll-behavior-y: none` é aplicado ao <html> SOMENTE durante o pull
 * ativo e restaurado em seguida.
 *
 * Guardas: `enabled`, `(pointer: coarse)`, overlay aberto (lockCount),
 * sheet de transação aberta, multi-toque, gesto com dominância horizontal
 * (pertence ao SwipeNav). `prefers-reduced-motion`: o refresh dispara
 * normalmente, mas o indicador é estático e some sem retração animada.
 */

export const PULL_THRESHOLD_PX = 64;
export const PULL_DAMPING = 0.45;
export const PULL_MAX_PX = 80;
export const PULL_ANCHORED_PX = 52;
export const PULL_HAPTIC_MS = 12;
const PULL_DOMINANCE_RATIO = 1.2;
const PULL_RETRACT_MS = 200;

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

/**
 * True quando o gesto nasce dentro de um scroll container interno já rolado
 * (ex.: Home rola em overflow-y-auto próprio, não no window). Nesse caso o
 * gesto pertence à lista — o PTR só arma no topo de TODAS as superfícies
 * de rolagem (window.scrollY<=0 E nenhum ancestral interno rolado).
 */
export function hasScrolledAncestor(el: EventTarget | null): boolean {
  let node = el as HTMLElement | null;
  while (node && node !== document.documentElement) {
    if (node.nodeType === 1) {
      const overflowY =
        window.getComputedStyle(node).overflowY || node.style.overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        node.scrollTop > 0
      )
        return true;
    }
    node = node.parentElement;
  }
  return false;
}

interface PullMark {
  y: number;
  x: number;
  el: EventTarget | null;
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
      // Container interno rolado: o gesto pertence à lista, não arma.
      if (hasScrolledAncestor(e.target)) return;
      startRef.current = { y: t.clientY, x: t.clientX, el: e.target };
    }

    function onTouchMove(e: TouchEvent) {
      const start = startRef.current;
      if (!start || !eligible()) return;
      // A lista pode ter rolado sob o dedo antes do threshold: revalida.
      if (hasScrolledAncestor(start.el)) {
        startRef.current = null;
        setPullDistance(0);
        return;
      }
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
      const damped = Math.min(dy * PULL_DAMPING, PULL_MAX_PX);
      setPullDistance(damped);
      if (damped >= PULL_THRESHOLD_PX) {
        if (!armedRef.current) {
          // Threshold cruzado: micro-haptic único (haptic util já respeita
          // reduced-motion) + trava o rubber-band.
          armedRef.current = true;
          haptic(PULL_HAPTIC_MS);
        }
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
      // Disparo instantâneo; o indicador ancora até o refresh concluir.
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

/**
 * Indicador da spec AGY §3: cápsula flutuante circular 36×36px centralizada
 * no topo (fundo/borda por tema via --ptr-capsule-*, elevação
 * var(--shadow-elevated)), arco esmeralda 2.5px. Pulling: rotação 0→180° e
 * opacidade 0.3→0.9 proporcionais; no threshold, escala 105% e cor
 * var(--accent-money). Refreshing: ancorado a 52px com rotação contínua
 * (animate-spin = 1s linear infinite). Saída: retração 200ms
 * var(--easing-standard). Tudo estático sob prefers-reduced-motion.
 */
export function PullToRefreshIndicator({
  state,
}: {
  state: UsePullToRefreshState;
}) {
  const [reducedMotion] = useState(() => prefersReducedMotion());
  const [leaving, setLeaving] = useState(false);
  const { pullDistance, isRefreshing } = state;
  const activeRef = useRef(false);

  useEffect(() => {
    const active = isRefreshing || pullDistance > 0;
    let timer: number | undefined;
    if (active) {
      activeRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLeaving(false);
    } else if (activeRef.current) {
      activeRef.current = false;
      if (!reducedMotion) {
        setLeaving(true);
        timer = window.setTimeout(() => setLeaving(false), PULL_RETRACT_MS);
      }
    }
    return () => window.clearTimeout(timer);
  }, [isRefreshing, pullDistance, reducedMotion]);

  if (!isRefreshing && pullDistance <= 0 && !leaving) return null;

  const armed = !isRefreshing && pullDistance >= PULL_THRESHOLD_PX;
  const progress = Math.min(pullDistance, PULL_THRESHOLD_PX) / PULL_THRESHOLD_PX;
  const travel = isRefreshing ? PULL_ANCHORED_PX : leaving ? 0 : pullDistance;
  const opacity = leaving ? 0 : isRefreshing ? 1 : 0.3 + 0.6 * progress;
  const transition = reducedMotion
    ? "none"
    : leaving
      ? "height 200ms var(--easing-standard), opacity 200ms var(--easing-standard)"
      : isRefreshing
        ? "height 200ms var(--easing-standard)"
        : "none";

  return (
    <div
      role="status"
      aria-label="Atualizando conteúdo"
      className="pointer-events-none relative z-30 flex justify-center overflow-hidden"
      style={{ height: travel, opacity, transition }}
    >
      <div
        data-testid="ptr-capsule"
        className="absolute bottom-0.5 flex h-9 w-9 items-center justify-center rounded-full border shadow-elevated"
        style={{
          background: "var(--ptr-capsule-bg)",
          borderColor: "var(--ptr-capsule-border)",
          transform: isRefreshing || reducedMotion ? undefined : `scale(${armed ? 1.05 : 1})`,
        }}
      >
        <Loader2
          size={20}
          strokeWidth={2.5}
          aria-hidden="true"
          data-testid="ptr-arc"
          className={
            isRefreshing && !reducedMotion
              ? "animate-spin text-primary"
              : armed
                ? "text-accent-money"
                : "text-primary"
          }
          style={
            isRefreshing || reducedMotion
              ? undefined
              : { transform: `rotate(${progress * 180}deg)` }
          }
        />
      </div>
    </div>
  );
}

export default usePullToRefresh;
