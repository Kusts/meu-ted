"use client";

import { isApiConfigured } from "@/lib/api/client";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppStateProvider } from "@/lib/state/app-state-context";
import { SheetProvider } from "@/lib/sheet-context";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import { initRUM } from "@/lib/observability/web-vitals";

import { useEffect } from "react";

export function RootProviders({ children }: { children: React.ReactNode }) {
  // Feature-flagged RUM: default OFF, enable via localStorage pi-finance:rum = 1
  useEffect(() => { initRUM(); }, []);

  // UnsavedChangesProvider wraps both AppStateProvider and children so
  // the AppState write functions can access trackWrite() via hooks.
  const providers = (
    <AppStateProvider>
      <SheetProvider>
        <UnsavedChangesProvider>
          {children}
        </UnsavedChangesProvider>
      </SheetProvider>
    </AppStateProvider>
  );

  if (!isApiConfigured()) {
    return providers;
  }

  return (
    <AuthGate>
      {providers}
    </AuthGate>
  );
}
