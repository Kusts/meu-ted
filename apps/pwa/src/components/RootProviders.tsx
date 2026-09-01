"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isApiConfigured } from "@/lib/api/client";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppStateProvider } from "@/lib/state/app-state-context";
import { SheetProvider } from "@/lib/sheet-context";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";
import { SWCoordinator } from "@/lib/sw-coordinator";
import { WorkspaceProvider } from "@/lib/auth/workspace-context";
import { ThemeProvider } from "@/lib/theme";
import { initRUM } from "@/lib/observability/web-vitals";

/**
 * Provider tree (ThemeProvider > agents-sdk: AuthGate > WorkspaceProvider > AppStateProvider)
 */
export function RootProviders({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initRUM();
  }, []);
  const pathname = usePathname();

  const isInviteRoute = pathname?.startsWith("/convite");

  if (isInviteRoute) {
    return (
      <ThemeProvider>
        <UnsavedChangesProvider>
          <SWCoordinator>
            <SheetProvider>{children}</SheetProvider>
          </SWCoordinator>
        </UnsavedChangesProvider>
      </ThemeProvider>
    );
  }

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

  const tree = isApiConfigured() ? <AuthGate>{inner}</AuthGate> : inner;

  return <ThemeProvider>{tree}</ThemeProvider>;
}
