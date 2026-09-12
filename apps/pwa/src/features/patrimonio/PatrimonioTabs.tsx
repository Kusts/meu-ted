"use client";

import AccountsPage from "@/features/accounts/AccountsPage";
import CardsPage from "@/features/cards/CardsPage";
import WalletPage from "@/features/wallet/WalletPage";
import { QueryTabs, useQueryTab } from "@/components/QueryTabs";
import { PATRIMONIO_ABAS } from "@/lib/routes";

/**
 * /hub/patrimonio — canonical section absorbing /contas, /cartoes and
 * /patrimonio (item 13). Detail deep links (?accountId=, ?cardId=) keep
 * working: the account/card pages read them from the URL.
 */
export default function PatrimonioTabs() {
  const aba = useQueryTab("aba", PATRIMONIO_ABAS, "contas");
  return (
    <div className="flex min-h-dvh flex-col bg-bg pb-[var(--tab-bar-height)]">
      <div className="px-5 pt-[calc(var(--page-pt)+env(safe-area-inset-top))] sm:px-8 lg:px-12">
        <QueryTabs
          ariaLabel="Contas e Cartões"
          defaultKey="contas"
          tabs={[
            { key: "contas", label: "Contas" },
            { key: "cartoes", label: "Cartões" },
            { key: "patrimonio", label: "Patrimônio" },
          ]}
        />
      </div>
      {aba === "cartoes" ? <CardsPage /> : aba === "patrimonio" ? <WalletPage /> : <AccountsPage />}
    </div>
  );
}
