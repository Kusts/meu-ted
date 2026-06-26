"use client";

import { AuthGate } from "@/features/auth/AuthGate";
import { AppStateProvider } from "@/lib/state/app-state-context";
import { SheetProvider } from "@/lib/sheet-context";

export function RootProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppStateProvider>
        <SheetProvider>{children}</SheetProvider>
      </AppStateProvider>
    </AuthGate>
  );
}
