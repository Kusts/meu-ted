"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import BottomSheet from "@/components/BottomSheet";
import NewTransactionSheet from "@/components/NewTransactionSheet";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import type { NavItem, RouteNavItem } from "@/components/BottomNav";
import type { SaveData } from "@/components/NewTransactionSheet";
import { useAppState } from "@/lib/state/app-state-context";
import { useSheet } from "@/lib/sheet-context";
import { useUnsavedChangesSafe } from "@/lib/unsaved-changes";

interface AppShellProps {
  children: ReactNode;
}

let _txCounter = 100;

function nextId(): string {
  _txCounter += 1;
  return `tx-${_txCounter}`;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"new" | "more" | "preselected">(
    "new",
  );
  const [preselectedKind, setPreselectedKind] = useState<
    "expense" | "income" | "transfer"
  >("expense");
  const {
    accounts,
    categories,
    addTransaction,
    createTransfer,
    addAccount,
    addCategory,
    addCard,
    createInstallments,
  } = useAppState();
  const { sheetKind, closeSheet } = useSheet();
  const { isDirty } = useUnsavedChangesSafe();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<RouteNavItem | null>(null);

  // Derive sheet open/mode from context (no setState-in-effect)
  const effectiveSheetOpen = sheetOpen || sheetKind !== null;
  const effectiveSheetMode: "new" | "more" | "preselected" = sheetKind
    ? "preselected"
    : sheetMode;
  const effectivePreselectedKind: "expense" | "income" | "transfer" =
    sheetKind ?? preselectedKind;

  // Listen for fallback event from pages that don't have context access
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ kind: "expense" | "income" | "transfer" }>).detail;
      if (detail?.kind) {
        setPreselectedKind(detail.kind);
        setSheetMode("preselected");
        setSheetOpen(true);
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pwa:open-tx", handler);
      return () => window.removeEventListener("pwa:open-tx", handler);
    }
  }, []);

  const activeNav: NavItem =
    pathname === "/"
      ? "home"
      : pathname === "/registros"
        ? "records"
        : pathname === "/a-pagar"
          ? "payables"
          : "more";

  function openSheetLocal(mode: "new" | "more") {
    setSheetMode(mode);
    setSheetOpen(true);
  }

  function closeSheetLocal() {
    setSheetOpen(false);
    closeSheet();
    setDiscardOpen(false);
    setPendingNav(null);
  }

  const ROUTE_MAP: Record<RouteNavItem, string> = {
    home: "/",
    records: "/registros",
    payables: "/a-pagar",
  };

  function navigateTo(item: RouteNavItem) {
    router.push(ROUTE_MAP[item]);
  }

  /** Close sheet, but confirm first when the form has unsaved edits. */
  function requestCloseSheet() {
    if (isDirty && (effectiveSheetMode === "new" || effectiveSheetMode === "preselected")) {
      setPendingNav(null);
      setDiscardOpen(true);
      return;
    }
    closeSheetLocal();
  }

  function handleNavClick(item: RouteNavItem) {
    // Navigating away while the tx sheet is dirty also needs confirm.
    if (isDirty && effectiveSheetOpen && (effectiveSheetMode === "new" || effectiveSheetMode === "preselected")) {
      setPendingNav(item);
      setDiscardOpen(true);
      return;
    }
    closeSheetLocal();
    navigateTo(item);
  }

  function confirmDiscard() {
    const nav = pendingNav;
    closeSheetLocal();
    if (nav) navigateTo(nav);
  }

  async function handleSave(data: SaveData) {
    try {
      if (data.kind === "transfer") {
        await createTransfer({
          description: data.description || "Transferência",
          amountCents: data.amountCents,
          date: data.date,
          fromAccountId: data.fromAccountId ?? "",
          toAccountId: data.toAccountId ?? "",
        });
      } else if (data.installmentsTotal && data.installmentsTotal > 1 && data.accountId) {
        await createInstallments({
          accountId: data.accountId,
          description: data.description,
          totalAmountCents: data.amountCents,
          purchaseDate: data.date,
          installmentsTotal: data.installmentsTotal,
          categoryId: data.categoryId,
        });
      } else {
        await addTransaction({
          id: nextId(),
          description: data.description,
          amountCents: data.amountCents,
          date: data.date,
          kind: data.kind,
          categoryId: data.categoryId ?? "",
          accountId: data.accountId ?? "",
        });
      }
      closeSheetLocal();
    } catch (e) {
      // Keep sheet open so draft inputs survive API validation errors (422).
      // Rethrow so the sheet keeps form dirty (markClean is skipped).
      throw e;
    }
  }

  return (
    <div
      data-shell="root"
      className="relative mx-auto flex min-h-dvh w-full max-w-[var(--shell-max-w)] flex-col bg-bg"
    >
      {children}

      <BottomNav
        active={activeNav}
        onFabClick={() => openSheetLocal("new")}
        onMoreClick={() => openSheetLocal("more")}
        onNavClick={handleNavClick}
      />

      <BottomSheet
        open={effectiveSheetOpen}
        onClose={requestCloseSheet}
        title={
          effectiveSheetMode === "new"
            ? "Novo lançamento"
            : effectiveSheetMode === "preselected"
              ? effectivePreselectedKind === "expense"
                ? "Nova despesa"
                : effectivePreselectedKind === "income"
                  ? "Nova receita"
                  : "Nova transferência"
              : "Mais"
        }
      >
        {effectiveSheetMode === "new" || effectiveSheetMode === "preselected" ? (
          <NewTransactionSheet
            key={effectivePreselectedKind}
            accounts={accounts}
            categories={categories}
            onSave={handleSave}
            onAddCategory={addCategory}
            onAddAccount={addAccount}
            onAddCard={addCard}
            initialTab={effectivePreselectedKind}
          />
        ) : (
          <div className="grid grid-cols-3 gap-[11px]">
            {[
              { label: "Patrimônio", tint: "#E7F3EC", color: "#0E8C5A", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg> },
              { label: "Contas", tint: "#EAF0EC", color: "#2FA56F", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg> },
              { label: "Cartões", tint: "#EEE9F7", color: "#820AD1", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" /></svg> },
              { label: "Assinaturas", tint: "#E8EFF7", color: "#3E6FB0", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 10h20" /><path d="M8 16h4" /></svg> },
              { label: "Orçamentos", tint: "#E7F3EC", color: "#0E8C5A", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9" /></svg> },
              { label: "Metas & Dívidas", tint: "#FBF1E3", color: "#B8791F", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg> },
              { label: "Categorias", tint: "#EAF0EC", color: "#2FA56F", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7.5 3h9L21 9l-9 12L3 9z" /><path d="M3 9h18" /></svg> },
              { label: "Relatórios", tint: "#E8EFF7", color: "#3E6FB0", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg> },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  closeSheetLocal();
                  const routeMap: Record<string, string> = {
                    Cartões: "/cartoes",
                    Orçamentos: "/orcamentos",
                    "Metas & Dívidas": "/metas",
                    Relatórios: "/relatorios",
                    Patrimônio: "/patrimonio",
                    Contas: "/contas",
                    Categorias: "/categorias",
                    Assinaturas: "/assinaturas",
                  };
                  const route = routeMap[item.label];
                  if (route) router.push(route);
                }}
                className="flex flex-col items-center gap-2 rounded-[15px] border border-border bg-fill-light p-3.5 transition-colors"
              >
                <span
                  className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px]"
                  style={{ background: item.tint, color: item.color }}
                >
                  {item.icon}
                </span>
                <span className="text-center text-[11.5px] font-semibold text-text-secondary">
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        )}
      </BottomSheet>

      <ConfirmActionDialog
        open={discardOpen}
        title="Descartar alterações?"
        message="Você tem alterações não salvas. Deseja sair sem salvar?"
        confirmLabel="Descartar"
        cancelLabel="Continuar editando"
        danger
        onConfirm={confirmDiscard}
        onCancel={() => {
          setDiscardOpen(false);
          setPendingNav(null);
        }}
      />
    </div>
  );
}