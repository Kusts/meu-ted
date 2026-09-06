import { useEffect, useRef, useState } from "react";

export const TICKER_INITIAL_MS = 500;
export const TICKER_UPDATE_MS = 320;

/**
 * ease-out expo — frenagem acentuada no espírito do
 * cubic-bezier(0.16,1,0.3,1) da spec (milhares rápidos, dezenas/centavos
 * suaves; sem efeito "slot machine"). Forma fechada: exata e testável,
 * sem solver de bezier no bundle.
 */
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

/**
 * P4 — NumberTicker hand-rolled: anima target via requestAnimationFrame.
 * Carga inicial/troca de workspace: 500ms; atualizações: 320ms.
 * Primeira montagem anima de 0; updates animam do valor atual.
 * Com prefers-reduced-motion (ou sem rAF) seta direto, sem animar.
 */
export function useAnimatedNumber(target: number): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const first = prevRef.current === null;
    const from = prevRef.current ?? 0;
    const durationMs = first ? TICKER_INITIAL_MS : TICKER_UPDATE_MS;
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (
      from === target ||
      reduced ||
      typeof requestAnimationFrame === "undefined"
    ) {
      // Snap direto (sem animar). setState diferido p/ cumprir
      // react-hooks/set-state-in-effect (sem render síncrono em cascata).
      prevRef.current = target;
      if (displayRef.current === target) return;
      displayRef.current = target;
      const timer = setTimeout(() => setDisplay(target), 0);
      return () => clearTimeout(timer);
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const value = Math.round(from + (target - from) * easeOutExpo(t));
      displayRef.current = value;
      setDisplay(value);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      prevRef.current = displayRef.current;
    };
  }, [target]);

  return display;
}
