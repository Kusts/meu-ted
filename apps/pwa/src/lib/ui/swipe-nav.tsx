"use client";

import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsOverlayOpen } from "./overlay-a11y";
import { useSheet } from "@/lib/sheet-context";

/**
 * F1 — swipe horizontal entre as 3 telas raiz (Resumo ↔ Registros ↔ A pagar).
 *
 * Decisão do debate: touch handlers + `router.push` (SEM scroll-snap pager —
 * quebraria fetch por rota, deep-link e precache do SW). Nenhum
 * `preventDefault` durante o gesto: só observamos touchstart/touchend, então
 * a rolagem vertical nativa nunca é sequestrada. A animação é de ENTRADA da
 * página destino (Web Animations API, 260ms, var(--easing-standard)),
 * nunca transform durante o gesto.
 *
 * Guardas: overlay aberto (lockCount), sheet de transação aberta,
 * origem dentro de `[data-no-swipe]`, viewport >= 860px, sem touch
 * (`(pointer: coarse)`), `prefers-reduced-motion` (navega sem animar).
 */

/** Ordem de navegação por swipe: esquerda avança, direita volta. */
export const SWIPE_ROUTES = ["/", "/registros", "/a-pagar"] as const;

export const SWIPE_THRESHOLD_PX = 60;
export const SWIPE_MIN_VELOCITY_PX_MS = 0.25;
export const SWIPE_LONG_DRAG_PX = 120;
export const SWIPE_DOMINANCE_RATIO = 1.2;
export const SWIPE_DESKTOP_BREAKPOINT_PX = 860;
export const SWIPE_ENTER_ANIMATION_MS = 260;

/** Destino do swipe dado o pathname atual e o deslocamento horizontal. */
export function targetRouteForSwipe(
  pathname: string | null | undefined,
  dx: number,
): string | null {
  if (!pathname) return null;
  const idx = SWIPE_ROUTES.indexOf(
    pathname as (typeof SWIPE_ROUTES)[number],
  );
  if (idx < 0) return null;
  if (dx < 0 && idx < SWIPE_ROUTES.length - 1) return SWIPE_ROUTES[idx + 1]!;
  if (dx > 0 && idx > 0) return SWIPE_ROUTES[idx - 1]!;
  return null;
}

function coarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function wideViewport(): boolean {
  if (typeof window === "undefined") return true;
  return window.innerWidth >= SWIPE_DESKTOP_BREAKPOINT_PX;
}

interface TouchMark {
  x: number;
  y: number;
  t: number;
}

export function SwipeNav({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const overlayOpen = useIsOverlayOpen();
  const { sheetKind } = useSheet();
  const wrapRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<TouchMark | null>(null);
  const directionRef = useRef<1 | -1>(1);
  const mountedRef = useRef(false);
  // Refs evitam closures obsoletas nos handlers de touch (sincronizado
  // pós-commit; eventos de touch sempre disparam após o commit).
  const stateRef = useRef({ overlayOpen, sheetKind, pathname });
  useEffect(() => {
    stateRef.current = { overlayOpen, sheetKind, pathname };
  });

  // Animação de entrada a cada troca de rota (progressive enhancement).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (prefersReducedMotion()) return;
    const el = wrapRef.current;
    const animate = el?.animate?.bind(el);
    if (!animate) return;
    const fromX = directionRef.current < 0 ? "16px" : "-16px";
    animate(
      [
        { opacity: 0, transform: `translateX(${fromX})` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: SWIPE_ENTER_ANIMATION_MS,
        easing: "cubic-bezier(.2,.8,.2,1)",
      },
    );
  }, [pathname]);

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    const t = e.changedTouches[0];
    if (!t) return;
    touchRef.current = { x: t.clientX, y: t.clientY, t: performance.now() };
  }

  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    // Zonas opt-out (carrosséis, sliders, drawers internos).
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("[data-no-swipe]")) return;
    const { overlayOpen, sheetKind, pathname } = stateRef.current;
    if (overlayOpen || sheetKind !== null) return;
    if (wideViewport() || !coarsePointer()) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < SWIPE_THRESHOLD_PX) return;
    if (absDx <= absDy * SWIPE_DOMINANCE_RATIO) return;
    const velocity = absDx / Math.max(1, performance.now() - start.t);
    if (absDx < SWIPE_LONG_DRAG_PX && velocity < SWIPE_MIN_VELOCITY_PX_MS)
      return;

    const dest = targetRouteForSwipe(pathname, dx);
    if (!dest) return;
    directionRef.current = dx < 0 ? 1 : -1;
    router.push(dest);
  }

  return (
    <div ref={wrapRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}

export default SwipeNav;
