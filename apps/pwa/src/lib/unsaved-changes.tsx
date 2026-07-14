// UnsavedChangesContext — tracks pending writes (dirty state) across the app.
// Components call `markDirty()` before a write and `markClean()` after it resolves.
// The SW coordinator reads `isDirty` to decide clean/dirty update strategy.
// Group A: NewTransaction, records, cards
// Group B: payables, budgets, goals, subscriptions, profile

"use client";

import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from "react";

export interface UnsavedChangesContextValue {
  /** True if any write is pending (unresolved). */
  isDirty: boolean;
  /** Register a pending write. Returns a cleanup function (call on resolve). */
  trackWrite: () => () => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirtyCount, setDirtyCount] = useState(0);
  const countRef = useRef(0);

  const trackWrite = useCallback(() => {
    countRef.current += 1;
    setDirtyCount(countRef.current);
    let resolved = false;
    return () => {
      if (resolved) return;
      resolved = true;
      countRef.current -= 1;
      setDirtyCount(countRef.current);
    };
  }, []);

  return (
    <UnsavedChangesContext.Provider value={{ isDirty: dirtyCount > 0, trackWrite }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  return ctx;
}

/**
 * Safe variant: returns a no-op trackWrite when there is no UnsavedChangesProvider
 * ancestor. Use this inside providers that are wrapped by UnsavedChangesProvider
 * in production but not in isolated test environments.
 */
export function useUnsavedChangesSafe(): {
  isDirty: boolean;
  trackWrite: () => () => void;
} {
  try {
    return useUnsavedChanges();
  } catch {
    return {
      isDirty: false,
      trackWrite: () => () => {},
    };
  }
}
