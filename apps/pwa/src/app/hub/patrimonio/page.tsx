import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import PatrimonioTabs from "@/features/patrimonio/PatrimonioTabs";

export default function HubPatrimonio() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <PatrimonioTabs />
      </Suspense>
    </AppShell>
  );
}
