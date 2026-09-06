"use client";

import Link from "next/link";
import Badge from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL } from "@/lib/format/brl";
import type { Account } from "@/lib/state/types";
import { Wallet } from "lucide-react";

function kindLabel(kind: Account["kind"]): string {
  return kind === "credit_card"
    ? "Cartão"
    : kind === "checking"
      ? "Conta corrente"
      : kind === "savings"
        ? "Poupança"
        : kind === "investment"
          ? "Investimento"
          : kind === "cash"
            ? "Dinheiro"
            : kind === "bank"
              ? "Conta"
              : "Outro";
}

interface AccountsCardProps {
  accounts: Account[];
  onOpenAccount: (id: string) => void;
  onAddAccount: () => void;
}

export function AccountsCard({ accounts, onOpenAccount, onAddAccount }: AccountsCardProps) {
  return (
    <div className="mb-[14px] overflow-hidden rounded-[18px] border border-border-subtle bg-surface-1 px-4 py-3 shadow-card">
      <div className="flex items-center justify-between pb-2">
        <span className="text-[14px] font-bold text-text-primary">Minhas contas</span>
        <Link
          href="/contas"
          className="text-[11px] font-bold text-primary hover:underline"
        >
          Ver tudo
        </Link>
      </div>
      {/* A4: empty state com CTA para o fluxo existente de Contas */}
      {accounts.length === 0 ? (
        <EmptyState
          icon={<Wallet size={24} />}
          title="Nenhuma conta ainda"
          description="Adicione sua primeira conta para ver o saldo total aqui."
          action={
            <Button size="sm" onClick={onAddAccount}>
              Adicionar conta
            </Button>
          }
        />
      ) : (
      accounts.map((acc) => (
        <button
          key={acc.id}
          type="button"
          data-testid="account-row"
          onClick={() => onOpenAccount(acc.id)}
          className="flex w-full items-center gap-3 border-b border-border-subtle py-2.5 text-left last:border-none hover:bg-surface-2/60 transition-colors rounded-[10px] px-1"
          aria-label={`Abrir ${acc.name} em Contas`}
        >
          <Badge label={acc.name} color={acc.color ?? "#4A5568"} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="truncate text-[13px] font-semibold text-text-primary">{acc.name}</div>
            <div className="text-[11px] text-text-muted">
              {kindLabel(acc.kind)}
            </div>
          </div>
          <div className="font-mono tabular-nums text-[13px] font-bold" style={{ color: acc.balanceCents >= 0 ? "var(--color-text-primary)" : "var(--color-danger)" }}>
            {formatBRL(acc.balanceCents)}
          </div>
        </button>
      )))}
    </div>
  );
}
