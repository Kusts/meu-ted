"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import Badge from "@/components/ui/Badge";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
import { StaleBanner } from "@/components/StaleBanner";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { useAppState } from "@/lib/state/app-state-context";
import { Plus, ChevronRight, FileText } from "lucide-react";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatInputBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10).toLocaleString("pt-BR")},${decPart}`;
}

const ACCOUNT_KINDS = [
  { value: "checking", label: "Conta corrente" },
  { value: "savings", label: "Poupança" },
  { value: "investment", label: "Investimento" },
];

const BANK_COLORS = [
  { value: "#820AD1", label: "Nubank" },
  { value: "#EC7000", label: "Itaú" },
  { value: "#003882", label: "Bradesco" },
  { value: "#005CA9", label: "Caixa" },
  { value: "#FF7A00", label: "Banco Inter" },
  { value: "#21C25E", label: "C6" },
  { value: "#4A5568", label: "Outro" },
];

function parseBRLToCents(value: string): number {
  const cleaned = value.replace(/[.\s]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

function AccountFormSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (input: { name: string; kind: "bank" | "cash" | "credit_card"; initialBalanceCents: number }) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("checking");
  const [bankColor, setBankColor] = useState("#820AD1");
  const [balance, setBalance] = useState("");

  function handleSave() {
    const displayName = name.trim() || (bankColor === "#820AD1" ? "Nubank" : bankColor);
    onAdd({
      name: displayName,
      kind: kind === "checking" ? "bank" : kind === "savings" ? "bank" : kind === "investment" ? "bank" : "bank",
      initialBalanceCents: parseBRLToCents(balance),
    });
    setName("");
    setBalance("");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nova conta">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Banco / cor
          </label>
          <div className="flex flex-wrap gap-2">
            {BANK_COLORS.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => setBankColor(b.value)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
                  bankColor === b.value
                    ? "bg-primary text-white shadow-xs"
                    : "bg-surface-2 text-text-secondary hover:bg-surface-3"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-xs"
                  style={{ background: b.value }}
                />
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Nubank, Itaú..."
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none transition-colors focus:border-primary"
          />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Tipo
          </label>
          <div className="flex gap-1 rounded-[14px] bg-surface-2 p-1 border border-border-subtle">
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`flex-1 rounded-[10px] py-2 text-center text-[12px] font-bold transition-all ${
                  kind === k.value
                    ? "bg-surface-1 text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Saldo inicial
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-bold text-text-muted">
              R$
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={balance}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                if (raw.length > 12) return;
                setBalance(formatInputBRL(raw));
              }}
              placeholder="0,00"
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-11 pr-3.5 font-mono tabular-nums text-[16px] font-bold text-text-primary outline-none transition-colors focus:border-primary"
            />
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98]"
        >
          Salvar conta
        </button>
      </div>
    </BottomSheet>
  );
}

function AccountEditSheet({ open, account, onClose, onSave }: {
  open: boolean;
  account: { id: string; name: string } | null;
  onClose: () => void;
  onSave: (id: string, name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (account) setName(account.name);
  }, [account]);

  function handleSave() {
    if (!account || !name.trim()) return;
    onSave(account.id, name.trim());
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar conta">
      <div className="flex flex-col gap-4">
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary"
          />
        </fieldset>
        <button
          type="button"
          onClick={handleSave}
          className="w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98]"
        >
          Salvar
        </button>
      </div>
    </BottomSheet>
  );
}

function AccountDetailSheet({
  account,
  miniHistory,
  open,
  onClose,
  onEdit,
  onDeactivate,
}: {
  account: { id: string; name: string; balanceCents: number; kind: string; color?: string } | null;
  miniHistory: { id: string; description: string; amountCents: number; date: string; kind: string }[];
  open: boolean;
  onClose: () => void;
  onEdit: (id: string, name: string) => void;
  onDeactivate: (id: string, name: string) => void;
}) {
  if (!account) return null;

  function kindLabel(kind: string): string {
    switch (kind) {
      case "credit_card": return "Cartão";
      case "checking": return "Conta corrente";
      case "savings": return "Poupança";
      case "investment": return "Investimento";
      case "cash": return "Dinheiro";
      case "bank": return "Conta";
      default: return "Outro";
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Detalhes da conta">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-3 rounded-[16px] border border-border-subtle bg-surface-2 p-3.5">
          <Badge label={account.name} color={account.color ?? "#4A5568"} size="md" />
          <div className="flex-1 min-w-0">
            <div className="truncate text-[14px] font-bold text-text-primary">{account.name}</div>
            <div className="text-[11px] font-medium text-text-muted">{kindLabel(account.kind)}</div>
          </div>
          <div className="font-mono tabular-nums text-[15px] font-bold text-text-primary">
            {formatBRL(account.balanceCents)}
          </div>
        </div>

        {/* Mini history */}
        {miniHistory.length > 0 && (
          <div className="border-t border-border-subtle pt-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-muted">
              Últimos lançamentos
            </div>
            <div className="space-y-1 rounded-[14px] border border-border-subtle bg-surface-2 p-2">
              {miniHistory.map((tx) => {
                const amountColor =
                  tx.kind === "expense"
                    ? "var(--color-danger)"
                    : tx.kind === "income"
                      ? "var(--color-primary)"
                      : "var(--color-info)";
                const prefix =
                  tx.kind === "expense"
                    ? "−"
                    : tx.kind === "income"
                      ? "+"
                      : "";
                return (
                  <div key={tx.id} className="flex items-center justify-between py-1 px-2 border-b border-border-subtle/50 last:border-none">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-text-primary">{tx.description}</span>
                      <span className="text-[10px] text-text-muted">
                        {new Date(tx.date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[12px] font-bold" style={{ color: amountColor }}>
                      {prefix}
                      {formatBRL(tx.amountCents)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CTA to records */}
        <Link
          href={`/registros?accountId=${account.id}`}
          className="flex items-center justify-center gap-2 rounded-[14px] border border-border-subtle bg-surface-2 py-3.5 text-center text-[14px] font-bold text-text-primary hover:bg-surface-3 transition-colors"
        >
          <FileText size={16} />
          Ver todos os registros
        </Link>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(account.id, account.name)}
            className="flex-1 rounded-[14px] border border-border-subtle bg-surface-2 py-3 text-center text-[13px] font-bold text-text-primary hover:bg-surface-3 transition-colors"
          >
            Editar conta
          </button>
          <button
            type="button"
            onClick={() => onDeactivate(account.id, account.name)}
            className="flex-1 rounded-[14px] bg-danger-tint border border-danger/20 py-3 text-center text-[13px] font-bold text-danger hover:bg-danger-tint/80 transition-colors"
          >
            Desativar conta
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

export default function AccountsPage() {
  const { accounts, transactions, loading, error, writeError, clearWriteError, addAccount, updateAccount, deactivateAccount } = useAppState();
  const [createOpen, setCreateOpen] = useState(false);
  const [detailAccount, setDetailAccount] = useState<(typeof accounts)[0] | null>(null);
  const [editAccount, setEditAccount] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; name: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("accountId");
    if (id) {
      const account = accounts.find((a) => a.id === id);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (account) setDetailAccount(account);
    }
  }, [accounts]);

  const checkingAccounts = useMemo(
    () => accounts.filter((a) => a.kind !== "credit_card"),
    [accounts],
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <StatusBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border-subtle border-t-primary" />
            <span className="text-[13px] font-semibold text-text-muted">Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  const totalBalance = checkingAccounts.reduce(
    (s, a) => s + a.balanceCents,
    0,
  );

  function getMiniHistory(accountId: string) {
    return transactions
      .filter((t) => t.accountId === accountId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader
          title="Contas"
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-primary-hover active:scale-95 transition-all"
            >
              <Plus size={15} strokeWidth={2.4} />
              Nova
            </button>
          }
        />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
            ⚠ {error}
          </div>
        )}

        <WriteErrorBanner message={writeError} onDismiss={clearWriteError} />

        <StaleBanner domains={["accounts", "transactions"]} />

        <div className="px-5 sm:px-8 lg:px-12">
          {/* Total balance card */}
          <div
            className="mb-4 overflow-hidden rounded-[20px] px-5 py-5 text-white shadow-card"
            style={{
              background: "linear-gradient(165deg, #0F6B45, #0A3A28)",
            }}
          >
            <div className="mb-1 text-[12px] font-medium text-white/70">
              Saldo somado
            </div>
            <div className="mb-1 font-mono tabular-nums text-[28px] font-bold tracking-tight text-white">
              {formatBRL(totalBalance)}
            </div>
            <div className="text-[11px] font-medium text-white/70">
              {checkingAccounts.length}{" "}
              {checkingAccounts.length === 1 ? "conta" : "contas"}
            </div>
          </div>

          {/* Account cards */}
          <div className="flex flex-col gap-3">
            {checkingAccounts.map((acc) => (
              <button
                type="button"
                key={acc.id}
                data-testid="account-card"
                data-account-id={acc.id}
                data-highlighted={detailAccount?.id === acc.id ? "true" : "false"}
                onClick={() => setDetailAccount(acc)}
                className={`relative w-full rounded-[18px] border bg-surface-1 px-4 py-3.5 pr-11 shadow-card transition-all text-left hover:bg-surface-2/60 ${
                  detailAccount?.id === acc.id
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border-subtle"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Badge label={acc.name} color={acc.color ?? "#4A5568"} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[14px] font-bold text-text-primary">
                      {acc.name}
                    </div>
                    <div className="text-[11px] font-medium text-text-muted">
                      {acc.kind === "credit_card"
                        ? "Cartão"
                        : acc.kind === "checking"
                          ? "Conta corrente"
                          : acc.kind === "savings"
                            ? "Poupança"
                            : acc.kind === "investment"
                              ? "Investimento"
                              : acc.kind === "cash"
                                ? "Dinheiro"
                                : acc.kind === "bank"
                                  ? "Conta"
                                  : "Outro"}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-[14px] font-bold text-text-primary">
                    {formatBRL(acc.balanceCents)}
                  </div>
                </div>
                {/* chevron */}
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                  <ChevronRight size={16} />
                </div>
              </button>
            ))}
            {checkingAccounts.length === 0 && (
              <div className="rounded-[18px] border border-dashed border-border-subtle bg-surface-1 px-4 py-8 text-center text-[13px] text-text-muted">
                Nenhuma conta cadastrada. Toque em Nova.
              </div>
            )}
          </div>
        </div>
      </main>

      <AccountFormSheet open={createOpen} onClose={() => setCreateOpen(false)} onAdd={addAccount} />

      <AccountEditSheet
        open={editOpen}
        account={editAccount}
        onClose={() => {
          setEditOpen(false);
          setEditAccount(null);
        }}
        onSave={(id, name) => updateAccount(id, { name })}
      />

      <AccountDetailSheet
        account={detailAccount}
        miniHistory={detailAccount ? getMiniHistory(detailAccount.id) : []}
        open={detailAccount !== null}
        onClose={() => setDetailAccount(null)}
        onEdit={(id, name) => {
          setDetailAccount(null);
          setEditAccount({ id, name });
          setEditOpen(true);
        }}
        onDeactivate={(id, name) => {
          setDetailAccount(null);
          setConfirmDeactivate({ id, name });
        }}
      />

      <ConfirmActionDialog
        open={confirmDeactivate !== null}
        title="Desativar conta"
        message={`Tem certeza que deseja desativar a conta "${confirmDeactivate?.name ?? ""}"? Esta ação pode ser desfeita.`}
        confirmLabel="Desativar"
        danger
        onConfirm={() => {
          if (confirmDeactivate) deactivateAccount(confirmDeactivate.id);
          setConfirmDeactivate(null);
        }}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}