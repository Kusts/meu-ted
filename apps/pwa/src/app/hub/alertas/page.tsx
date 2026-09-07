import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import AlertasTabs from "@/features/alertas/AlertasTabs";

export default function HubAlertas() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <AlertasTabs />
      </Suspense>
    </AppShell>
  );
}
