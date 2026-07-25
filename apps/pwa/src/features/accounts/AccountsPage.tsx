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
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Banco / cor
          </label>
          <div className="flex flex-wrap gap-2">
            {BANK_COLORS.map((b) => (
              <button
                key={b.value}
                type="button"
                onClick={() => setBankColor(b.value)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  bankColor === b.value
                    ? "bg-primary text-white"
                    : "bg-fill-light text-text-secondary"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: b.value }}
                />
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Nubank, Itaú..."
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-primary"
          />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Tipo
          </label>
          <div className="flex gap-1 rounded-xl bg-fill-light p-1">
            {ACCOUNT_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={`flex-1 rounded-[10px] py-2 text-center text-[12px] font-bold transition-colors ${
                  kind === k.value
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-muted"
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Saldo inicial
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">
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
              className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none transition-colors focus:border-primary"
            />
          </div>
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
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
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary"
          />
        </fieldset>
        <button
          type="button"
          onClick={handleSave}
          className="w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
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
        <div className="flex items-center gap-3">
          <Badge label={account.name} color={account.color ?? "#4A5568"} size="md" />
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-text-primary">{account.name}</div>
            <div className="text-[11px] text-text-muted">{kindLabel(account.kind)}</div>
          </div>
          <div className="font-mono text-[14px] font-semibold text-text-primary">
            {formatBRL(account.balanceCents)}
          </div>
        </div>

        {/* Mini history */}
        {miniHistory.length > 0 && (
          <div className="border-t border-fill-medium pt-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              Últimos lançamentos
            </div>
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
                <div key={tx.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-text-primary">{tx.description}</span>
                    <span className="text-[10px] text-text-muted">
                      {new Date(tx.date + "T12:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <span className="font-mono text-[12px] font-semibold" style={{ color: amountColor }}>
                    {prefix}
                    {formatBRL(tx.amountCents)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* CTA to records */}
        <Link
          href={`/registros?accountId=${account.id}`}
          className="flex items-center justify-center gap-2 rounded-[14px] bg-fill-light py-[14px] text-center text-[14px] font-bold text-text-primary transition-opacity hover:opacity-90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Ver todos os registros
        </Link>

        {/* Actions */}
        <button
          type="button"
          onClick={() => onEdit(account.id, account.name)}
          className="w-full rounded-[14px] bg-fill-light py-[14px] text-center text-[14px] font-bold text-text-primary"
        >
          Editar conta
        </button>
        <button
          type="button"
          onClick={() => onDeactivate(account.id, account.name)}
          className="w-full rounded-[14px] bg-danger-tint py-[14px] text-center text-[14px] font-bold text-danger"
        >
          Desativar conta
        </button>
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

  // Read ?accountId=<id> from the URL on mount. Used by the Home page to
  // deep-link — opens the detail sheet for the matching account.
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
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-fill-medium border-t-primary" />
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
              className="flex items-center gap-1.5 rounded-full bg-primary px-[15px] py-[9px] text-[12px] font-bold text-white"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
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

        <div className="px-5">
          {/* Total balance card */}
          <div
            className="mb-4 overflow-hidden rounded-[16px] px-4 py-4 text-white shadow-card"
            style={{
              background: "linear-gradient(165deg, #0F6B45, #0A3A28)",
            }}
          >
            <div className="mb-1 text-[12px] text-white/70">
              Saldo somado
            </div>
            <div className="mb-1 font-mono text-[26px] font-semibold tracking-tight text-white">
              {formatBRL(totalBalance)}
            </div>
            <div className="text-[11px] text-white/70">
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
                className={`relative w-full rounded-[15px] border bg-surface px-4 py-3.5 pr-11 shadow-card transition-colors text-left ${
                  detailAccount?.id === acc.id
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Badge label={acc.name} color={acc.color ?? "#4A5568"} size="md" />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-text-primary">
                      {acc.name}
                    </div>
                    <div className="text-[11px] text-text-muted">
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
                  <div className="font-mono text-[14px] font-semibold text-text-primary">
                    {formatBRL(acc.balanceCents)}
                  </div>
                </div>
                {/* chevron */}
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </button>
            ))}
            {checkingAccounts.length === 0 && (
              <div className="rounded-[16px] border border-dashed border-border bg-surface px-4 py-8 text-center text-[13px] text-text-muted">
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