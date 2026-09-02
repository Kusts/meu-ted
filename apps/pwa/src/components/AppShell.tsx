"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import BottomSheet from "@/components/BottomSheet";
import NewTransactionSheet from "@/components/NewTransactionSheet";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import SidebarRail from "@/components/SidebarRail";
import { Icon, type IconName } from "@/components/ui/Icon";
import type { NavItem } from "@/components/BottomNav";
import type { SaveData } from "@/components/NewTransactionSheet";
import { useAppState } from "@/lib/state/app-state-context";
import { useSheet } from "@/lib/sheet-context";
import { useUnsavedChangesSafe } from "@/lib/unsaved-changes";
import { recordAdoptionEvent } from "@/lib/api/adoption";
import { TedChatLauncher } from "@/features/ted/TedChatLauncher";
import { fetchPendingMe } from "@/lib/api/auth";

interface AppShellProps {
  children: ReactNode;
}

export type OpenTransactionDetail = {
  kind: "expense" | "income" | "transfer";
  description?: string;
  flowId?: string;
};

export function parseOpenTransactionEvent(
  event: Event,
): OpenTransactionDetail | undefined {
  const detail = (event as CustomEvent<OpenTransactionDetail>).detail;
  return detail?.kind ? detail : undefined;
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
  const [initialDescription, setInitialDescription] = useState("");
  const [captureFlowId, setCaptureFlowId] = useState<string | undefined>();
  const {
    accounts,
    categories,
    addTransaction,
    createTransfer,
    addAccount,
    addCategory,
    addCard,
    createInstallments,
    readOnly,
  } = useAppState();
  const { sheetKind, closeSheet } = useSheet();
  const { isDirty } = useUnsavedChangesSafe();
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingNav, setPendingNav] = useState<NavItem | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);

  // Load pending invites count for badge
  useLayoutEffect(() => {
    let cancelled = false;
    fetchPendingMe()
      .then((res) => { if (!cancelled) setPendingInviteCount(res.total); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Derive sheet open/mode from context (no setState-in-effect)
  const effectiveSheetOpen = sheetOpen || sheetKind !== null;
  const effectiveSheetMode: "new" | "more" | "preselected" = sheetKind
    ? "preselected"
    : sheetMode;
  const effectivePreselectedKind: "expense" | "income" | "transfer" =
    sheetKind ?? preselectedKind;

  // Listen for fallback event from pages that don't have context access
  useLayoutEffect(() => {
    function handler(e: Event) {
      const detail = parseOpenTransactionEvent(e);
      if (detail) {
        setPreselectedKind(detail.kind);
        setInitialDescription(detail.description ?? "");
        setCaptureFlowId(detail.flowId);
        if (detail.flowId)
          void recordAdoptionEvent("capture_started", {
            flowId: detail.flowId,
          });
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
    setInitialDescription("");
    setCaptureFlowId(undefined);
    setSheetOpen(true);
  }

  function closeSheetLocal() {
    setSheetOpen(false);
    setInitialDescription("");
    setCaptureFlowId(undefined);
    closeSheet();
    setDiscardOpen(false);
    setPendingNav(null);
  }

  function navigateTo(item: NavItem) {
    if (item === "home") router.push("/");
    else if (item === "records") router.push("/registros");
    else if (item === "payables") router.push("/a-pagar");
  }

  /** Close sheet, but confirm first when the form has unsaved edits. */
  function requestCloseSheet() {
    if (
      isDirty &&
      (effectiveSheetMode === "new" || effectiveSheetMode === "preselected")
    ) {
      setPendingNav(null);
      setDiscardOpen(true);
      return;
    }
    closeSheetLocal();
  }

  function handleNavClick(item: NavItem) {
    // Navigating away while the tx sheet is dirty also needs confirm.
    if (
      isDirty &&
      effectiveSheetOpen &&
      (effectiveSheetMode === "new" || effectiveSheetMode === "preselected")
    ) {
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
      } else if (
        data.installmentsTotal &&
        data.installmentsTotal > 1 &&
        data.accountId
      ) {
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
      if (captureFlowId)
        void recordAdoptionEvent("capture_completed", {
          flowId: captureFlowId,
        });
      if (!readOnly) closeSheetLocal();
    } catch (e) {
      throw e;
    }
  }

  const moreItems: { label: string; route: string; icon: IconName }[] = [
    { label: "Patrimônio", route: "/patrimonio", icon: "wallet" },
    { label: "Contas", route: "/contas", icon: "home" },
    { label: "Cartões", route: "/cartoes", icon: "credit-card" },
    { label: "Assinaturas", route: "/assinaturas", icon: "tag" },
    { label: "Orçamentos", route: "/orcamentos", icon: "chart" },
    { label: "Metas & Dívidas", route: "/metas", icon: "target" },
    { label: "Categorias", route: "/categorias", icon: "folder-open" },
    { label: "Workspaces", route: "/workspaces", icon: "folder-open" },
    { label: "Aprovações", route: "/pending", icon: "alert-triangle" },
    { label: "Relatórios", route: "/relatorios", icon: "chart" },
  ];

  return (
    <div className="flex min-h-dvh w-full bg-bg">
      {/* Desktop Sidebar Rail */}
      <SidebarRail onNewTransaction={() => openSheetLocal("new")} />

      {/* Main Content Shell */}
      <div
        data-shell="root"
        className="relative mx-auto flex min-h-dvh w-full max-w-[var(--shell-max-w)] lg:max-w-none flex-1 flex-col bg-bg transition-all"
      >
        <div className="flex-1 w-full max-w-7xl mx-auto">
          {children}
        </div>

        {/* Mobile Bottom Navigation */}
        <BottomNav
          active={activeNav}
          onFabClick={() => openSheetLocal("new")}
          onMoreClick={() => openSheetLocal("more")}
          onNavClick={handleNavClick}
        />

        {/* New Transaction / More Drawer */}
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
          {effectiveSheetMode === "new" ||
          effectiveSheetMode === "preselected" ? (
            <NewTransactionSheet
              key={effectivePreselectedKind}
              accounts={accounts}
              categories={categories}
              onSave={handleSave}
              onAddCategory={addCategory}
              onAddAccount={addAccount}
              onAddCard={addCard}
              initialTab={effectivePreselectedKind}
              initialDescription={initialDescription}
            />
          ) : (
            <div className="grid grid-cols-3 gap-[11px]">
              {moreItems.map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    closeSheetLocal();
                    router.push(item.route);
                  }}
                  className="flex flex-col items-center gap-2 rounded-[16px] border border-border-subtle bg-surface-2 p-3.5 transition-all hover:bg-surface-3 active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-primary-tint text-primary shadow-xs">
                    <Icon name={item.icon} size={20} />
                  </span>
                  <span className="text-center text-[12px] font-semibold text-text-primary">
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

        <TedChatLauncher />
        {pendingInviteCount > 0 && (
          <div className="fixed bottom-20 right-5 z-50 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground shadow-elevated" aria-label={`${pendingInviteCount} convite(s) pendente(s)`}>
            <span>🔔</span>
            <span>{pendingInviteCount}</span>
          </div>
        )}
      </div>
    </div>
  );
}
