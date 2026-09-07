"use client";

import PayablesPage from "@/features/payables/PayablesPage";
import PendingOperationsPage from "@/features/pending-operations/PendingOperationsPage";
import { QueryTabs, useQueryTab } from "@/components/QueryTabs";
import { COMPROMISSOS_ABAS } from "@/lib/routes";

/**
 * /compromissos — canonical section absorbing /a-pagar and /pending
 * (item 13). Tab lives in ?aba= so redirects and deep links land right.
 * Feature pages are composed unchanged (headers + actions preserved).
 */
export default function CompromissosTabs() {
  const aba = useQueryTab("aba", COMPROMISSOS_ABAS, "a-pagar");
  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[var(--tab-bar-height)]">
      <div className="px-5 pt-[calc(var(--page-pt)+env(safe-area-inset-top))] sm:px-8 lg:px-12">
        <QueryTabs
          ariaLabel="Compromissos"
          defaultKey="a-pagar"
          tabs={[
            { key: "a-pagar", label: "A Pagar" },
            { key: "pendencias", label: "Pendências" },
          ]}
        />
      </div>
      {aba === "pendencias" ? <PendingOperationsPage /> : <PayablesPage />}
    </div>
  );
}
