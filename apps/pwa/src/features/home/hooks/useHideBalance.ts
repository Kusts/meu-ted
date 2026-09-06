import { useCallback, useEffect, useState } from "react";

export const HIDE_BALANCE_KEY = "meu-ted:hide-balance";

/**
 * P3 — saldo ocultável com persistência (default visível).
 * Leitura do storage só no client (sem flash de hidratação).
 */
export function useHideBalance() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDE_BALANCE_KEY) === "1");
    } catch {
      /* storage indisponível: mantém visível */
    }
  }, []);

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
