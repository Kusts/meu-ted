"use client";

import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import { CaptureBridge } from "./capture-bridge";

export default function CapturePage() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <CaptureBridge />
      </Suspense>
    </AppShell>
  );
}
