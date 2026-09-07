import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import CompromissosTabs from "@/features/compromissos/CompromissosTabs";

export default function Compromissos() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <CompromissosTabs />
      </Suspense>
    </AppShell>
  );
}
