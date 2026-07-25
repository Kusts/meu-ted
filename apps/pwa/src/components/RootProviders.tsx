"use client";

import { useEffect } from "react";
import { isApiConfigured } from "@/lib/api/client";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppStateProvider } from "@/lib/state/app-state-context";
import { SheetProvider } from "@/lib/sheet-context";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import { SWCoordinator } from "@/lib/sw-coordinator";
import { initRUM } from "@/lib/observability/web-vitals";

/**
 * Provider tree (design Task 8):
 *   UnsavedChangesProvider > SWCoordinator > AppStateProvider > SheetProvider
 *
 * AuthGate wraps the tree when API is configured (session gate).
 */
export function RootProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initRUM();
  }, []);

  const tree = (
    <UnsavedChangesProvider>
      <SWCoordinator>
        <AppStateProvider>
          <SheetProvider>{children}</SheetProvider>
        </AppStateProvider>
      </SWCoordinator>
    </UnsavedChangesProvider>
  );

  if (!isApiConfigured()) {
    return tree;
  }

  return <AuthGate>{tree}</AuthGate>;
}
