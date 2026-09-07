"use client";

import BudgetsPage from "@/features/budgets/BudgetsPage";
import GoalsPage from "@/features/goals/GoalsPage";
import SubscriptionsPage from "@/features/subscriptions/SubscriptionsPage";
import { QueryTabs, useQueryTab } from "@/components/QueryTabs";
import { PLANEJAMENTO_ABAS } from "@/lib/routes";

/**
 * /hub/planejamento — canonical section absorbing /orcamentos, /metas and
 * /assinaturas (item 13).
 */
export default function PlanejamentoTabs() {
  const aba = useQueryTab("aba", PLANEJAMENTO_ABAS, "orcamentos");
  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[var(--tab-bar-height)]">
      <div className="px-5 pt-[calc(var(--page-pt)+env(safe-area-inset-top))] sm:px-8 lg:px-12">
        <QueryTabs
          ariaLabel="Planejamento"
          defaultKey="orcamentos"
          tabs={[
            { key: "orcamentos", label: "Orçamentos" },
            { key: "metas", label: "Metas" },
            { key: "assinaturas", label: "Assinaturas" },
          ]}
        />
      </div>
      {aba === "metas" ? <GoalsPage /> : aba === "assinaturas" ? <SubscriptionsPage /> : <BudgetsPage />}
    </div>
  );
}
