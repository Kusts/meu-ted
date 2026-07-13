"use client";

import { isApiConfigured } from "@/lib/api/client";
import { AuthGate } from "@/features/auth/AuthGate";
import { AppStateProvider } from "@/lib/state/app-state-context";
import { SheetProvider } from "@/lib/sheet-context";

export function RootProviders({ children }: { children: React.ReactNode }) {
  // When API is not configured, skip AuthGate entirely and render mock UI
  // directly. This avoids unnecessary /auth/devices/register requests and
  // allows the PWA to work fully offline with mock data.
  if (!isApiConfigured()) {
    return (
      <AppStateProvider>
        <SheetProvider>{children}</SheetProvider>
      </AppStateProvider>
    );
  }

  return (
    <AuthGate>
      <AppStateProvider>
        <SheetProvider>{children}</SheetProvider>
      </AppStateProvider>
    </AuthGate>
  );
}
