"use client";

import { useEffect } from "react";
import { isApiConfigured } from "@/lib/api/client";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppStateProvider } from "@/lib/state/app-state-context";
import { SheetProvider } from "@/lib/sheet-context";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import { SWCoordinator } from "@/lib/sw-coordinator";
import { WorkspaceProvider } from "@/lib/auth/workspace-context";
import { initRUM } from "@/lib/observability/web-vitals";

/**
 * Provider tree (agents-sdk: AuthGate > WorkspaceProvider > AppStateProvider)
 */
export function RootProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initRUM();
  }, []);

  const inner = (
    <UnsavedChangesProvider>
      <SWCoordinator>
        <WorkspaceProvider>
          <AppStateProvider>
            <SheetProvider>{children}</SheetProvider>
          </AppStateProvider>
        </WorkspaceProvider>
      </SWCoordinator>
    </UnsavedChangesProvider>
  );

  if (!isApiConfigured()) {
    return inner;
  }

  return <AuthGate>{inner}</AuthGate>;
}
