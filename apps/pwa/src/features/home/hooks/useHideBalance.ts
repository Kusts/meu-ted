import { useCallback, useSyncExternalStore } from "react";

export const HIDE_BALANCE_KEY = "meu-ted:hide-balance";

type Listener = () => void;
const listeners = new Set<Listener>();

function readStored(): boolean {
  try {
    return window.localStorage.getItem(HIDE_BALANCE_KEY) === "1";
  } catch {
    return false;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  // Sincroniza abas/janelas (evento "storage" não dispara no próprio documento).
  window.addEventListener("storage", notify);
}

/**
 * P3 — saldo ocultável com persistência (default visível).
 * useSyncExternalStore: snapshot do SSR é sempre visível (sem mismatch);
 * o cliente assume a preferência gravada logo após o mount (1 frame de
 * flash aceitável). Sem setState em effect (lint set-state-in-effect).
 */
export function useHideBalance() {
  const hidden = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    readStored,
    () => false,
  );

  const toggle = useCallback(() => {
    const next = !readStored();
    try {
      window.localStorage.setItem(HIDE_BALANCE_KEY, next ? "1" : "0");
    } catch {
      /* noop */
    }
    notify();
  }, []);

  return { hidden, toggle };
}
