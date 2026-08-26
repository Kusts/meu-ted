import AppShell from "@/components/AppShell";
import PendingOperationsPage from "@/features/pending-operations/PendingOperationsPage";

export default function PendingRoute() {
  return (
    <AppShell>
      <PendingOperationsPage />
    </AppShell>
  );
}
