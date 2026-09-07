"use client";

import NotificationsSheet from "@/features/profile/NotificationsSheet";
import PriceAlertsPage from "@/features/price-alerts/PriceAlertsPage";
import { QueryTabs, useQueryTab } from "@/components/QueryTabs";
import { ALERTAS_ABAS } from "@/lib/routes";

/**
 * /hub/alertas — canonical section absorbing /alerts and /alerts/price
 * (item 13). Financeiras reuses the notifications panel in inline mode
 * (same data, actions and dismiss behavior as the sheet, no duplication).
 */
export default function AlertasTabs() {
  const aba = useQueryTab("aba", ALERTAS_ABAS, "financeiras");
  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[var(--tab-bar-height)]">
      <div className="px-5 pt-[calc(var(--page-pt)+env(safe-area-inset-top))] sm:px-8 lg:px-12">
        <QueryTabs
          ariaLabel="Alertas"
          defaultKey="financeiras"
          tabs={[
            { key: "financeiras", label: "Financeiras" },
            { key: "preco", label: "Preço" },
          ]}
        />
      </div>
      {aba === "preco" ? (
        <PriceAlertsPage />
      ) : (
        <div className="px-5 pb-6 pt-4 sm:px-8 lg:px-12">
          <NotificationsSheet open={false} onClose={() => {}} inline />
        </div>
      )}
    </div>
  );
}
