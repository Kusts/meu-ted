import { useCallback, useState } from "react";

export const HIDE_BALANCE_KEY = "meu-ted:hide-balance";

/**
 * P3 — saldo ocultável com persistência (default visível).
 * Leitura do storage no inicializador (lazy) — sem effect + setState,
 * sem render em cascata e sem flash pós-hidratação.
 */
export function useHideBalance() {
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(HIDE_BALANCE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(HIDE_BALANCE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return { hidden, toggle };
}
