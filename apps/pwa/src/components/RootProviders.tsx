"use client";

import { isApiConfigured } from "@/lib/api/client";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppStateProvider } from "@/lib/state/app-state-context";
import { SheetProvider } from "@/lib/sheet-context";
import { UnsavedChangesProvider } from "@/lib/unsaved-changes";

export function RootProviders({ children }: { children: React.ReactNode }) {
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
