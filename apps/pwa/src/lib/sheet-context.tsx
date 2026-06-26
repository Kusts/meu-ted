"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type SheetKind = "expense" | "income" | "transfer" | null;

interface SheetContextValue {
  sheetKind: SheetKind;
  openSheet: (kind: SheetKind) => void;
  closeSheet: () => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function SheetProvider({ children }: { children: ReactNode }) {
  const [sheetKind, setSheetKind] = useState<SheetKind>(null);

  function openSheet(kind: SheetKind) {
    setSheetKind(kind);
  }
  function closeSheet() {
    setSheetKind(null);
  }

  return (
    <SheetContext.Provider value={{ sheetKind, openSheet, closeSheet }}>
      {children}
    </SheetContext.Provider>
  );
}

export function useSheet(): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) {
    return {
      sheetKind: null,
      openSheet: () => {},
      closeSheet: () => {},
    };
  }
  return ctx;
}