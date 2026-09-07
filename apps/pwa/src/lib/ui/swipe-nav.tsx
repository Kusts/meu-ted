"use client";

import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsOverlayOpen } from "./overlay-a11y";
import { useSheet } from "@/lib/sheet-context";

/**
 * F1 — swipe horizontal entre as telas raiz da IA canônica
 * (Início ↔ Extrato ↔ Compromissos ↔ Hub, item 13).
 *
 * Decisão do debate: touch handlers + `router.push` (SEM scroll-snap pager —
 * quebraria fetch por rota, deep-link e precache do SW; View Transitions só
 * como enhancement progressivo). Nenhum `preventDefault` durante o gesto: só
 * observamos touchstart/touchend, então a rolagem vertical nativa nunca é
 * sequestrada. A animação é de ENTRADA da página destino (Web Animations
 * API, 260ms, var(--easing-standard)), nunca transform durante o gesto.
 *
 * Guardas: overlay aberto (lockCount), sheet de transação aberta,
 * origem em scroller horizontal ou `[data-no-swipe]`, viewport >= 860px,
 * sem touch (`(pointer: coarse)`). `prefers-reduced-motion`: a navegação
 * ocorre instantaneamente, sem animação de entrada.
 *
 * Onda 5: nas rotas NÃO-raiz (subpáginas do Hub e demais), swipe dominante
 * para a DIREITA executa `router.back()` uma vez por gesto, instantâneo e
 * sem animação de entrada, sob as MESMAS guardas acima.
 */

/** Ordem de navegação por swipe: esquerda avança, direita volta. */
export const SWIPE_ROUTES = ["/", "/registros", "/compromissos", "/hub"] as const;

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

/**
 * Onda 5 — volta por gesto nas subpáginas do drawer Mais (feedback do
 * usuário: o swipe só funcionava nas 3 telas raiz). Em rota NÃO-raiz, um
 * gesto horizontal dominante para a DIREITA (dx positivo) volta uma entrada
 * no histórico. Rotas raiz nunca voltam por aqui (cíclico intacto) e gesto
 * para a esquerda em subpágina não faz nada.
 */
export function shouldSwipeBack(
  pathname: string | null | undefined,
  dx: number,
): boolean {
  if (!pathname) return false;
  if (dx <= 0) return false;
  return !(SWIPE_ROUTES as readonly string[]).includes(pathname);
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

/** Easing do token de design, com fallback idêntico para jsdom/SSR. */
function enterEasing(el: HTMLElement): string {
  const token =
    typeof window !== "undefined" && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(el).getPropertyValue("--easing-standard").trim()
      : "";
  return token || "cubic-bezier(.2,.8,.2,1)";
}

/**
 * True quando o gesto nasce numa zona de rolagem horizontal: qualquer
 * ancestral até `root` com `[data-no-swipe]` (opt-out explícito, funciona
 * sem cascata CSS) ou com scroll horizontal ativo (overflow-x auto/scroll
 * com conteúdo transbordando). Evita roubar o gesto de carrosséis e
 * trilhas de chips.
 */
export function startsInHorizontalZone(
  el: HTMLElement | null,
  root: HTMLElement | null,
): boolean {
  let node: HTMLElement | null = el;
  while (node && node !== root) {
    if (node.nodeType === 1) {
      if (typeof node.hasAttribute === "function" && node.hasAttribute("data-no-swipe"))
        return true;
      const overflowX =
        window.getComputedStyle(node).overflowX || node.style.overflowX;
      if (
        (overflowX === "auto" || overflowX === "scroll") &&
        node.scrollWidth > node.clientWidth + 1
      )
        return true;
    }
    node = node.parentElement;
  }
  return false;
}

interface TouchMark {
  x: number;
  y: number;
  t: number;
  el: HTMLElement | null;
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
  // Decidido no gesto: só anima a chegada quando o dispositivo permite
  // movimento. Consumido uma vez pelo efeito de entrada abaixo.
  const animateArrivalRef = useRef(true);
  // Refs evitam closures obsoletas nos handlers de touch (sincronizado
  // pós-commit; eventos de touch sempre disparam após o commit).
  const stateRef = useRef({ overlayOpen, sheetKind, pathname });
  useEffect(() => {
    stateRef.current = { overlayOpen, sheetKind, pathname };
  });

  // Animação de entrada a cada troca de rota (progressive enhancement).
  // Sob prefers-reduced-motion a navegação já ocorreu instantaneamente via
  // router.push — aqui só garantimos que nenhuma animação a acompanhe.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const animateArrival = animateArrivalRef.current;
    animateArrivalRef.current = true;
    if (!animateArrival || prefersReducedMotion()) return;
    const el = wrapRef.current;
    if (!el) return;
    const animate = el.animate?.bind(el);
    if (!animate) return;
    const fromX = directionRef.current < 0 ? "16px" : "-16px";
    animate(
      [
        { opacity: 0, transform: `translateX(${fromX})` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      {
        duration: SWIPE_ENTER_ANIMATION_MS,
        easing: enterEasing(el),
      },
    );
  }, [pathname]);

  function onTouchStart(e: TouchEvent<HTMLDivElement>) {
    const t = e.changedTouches[0];
    if (!t) return;
    touchRef.current = {
      x: t.clientX,
      y: t.clientY,
      t: performance.now(),
      el: e.target as HTMLElement | null,
    };
  }

  function onTouchEnd(e: TouchEvent<HTMLDivElement>) {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    // Zonas de rolagem horizontal (carrosséis, trilhas de chips) e opt-out
    // explícito: o gesto pertence ao scroller, nunca à navegação.
    if (startsInHorizontalZone(start.el, wrapRef.current)) return;
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
    if (dest) {
      directionRef.current = dx < 0 ? 1 : -1;
      // Navegação instantânea; a animação de entrada (quando permitida) é
      // aplicada pelo efeito acima na página destino.
      animateArrivalRef.current = !prefersReducedMotion();
      router.push(dest);
      return;
    }
    // Onda 5: subpágina do Hub + swipe para a direita = router.back(),
    // instantâneo e SEM animação de entrada (respeita reduced-motion por
    // construção). Um gesto dispara no máximo uma navegação (return).
    if (shouldSwipeBack(pathname, dx)) {
      animateArrivalRef.current = false;
      router.back();
    }
  }

  return (
    <div ref={wrapRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}

export default SwipeNav;
