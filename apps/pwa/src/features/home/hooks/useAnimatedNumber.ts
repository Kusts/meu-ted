import { useEffect, useRef, useState } from "react";

export const TICKER_DURATION_MS = 600;

/**
 * P4 — NumberTicker hand-rolled: anima target via requestAnimationFrame
 * (ease-out cúbico). Primeira montagem anima de 0; updates animam do valor
 * atual. Com prefers-reduced-motion (ou sem rAF) seta direto, sem animar.
 */
export function useAnimatedNumber(
  target: number,
  durationMs = TICKER_DURATION_MS,
): number {
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current ?? 0;
    if (from === target) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const reduced =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof requestAnimationFrame === "undefined") {
      prevRef.current = target;
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (target - from) * eased);
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
  }, [target, durationMs]);

  return display;
}
