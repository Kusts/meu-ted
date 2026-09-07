import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import PlanejamentoTabs from "@/features/planejamento/PlanejamentoTabs";

export default function HubPlanejamento() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <PlanejamentoTabs />
      </Suspense>
    </AppShell>
  );
}
