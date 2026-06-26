"use client";

import Link from "next/link";
import StatusBar from "@/components/StatusBar";
import Badge from "@/components/ui/Badge";
import { useAppState } from "@/lib/state/app-state-context";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function accountKindLabel(kind: string): string {
  switch (kind) {
    case "checking":
      return "Conta corrente";
    case "savings":
      return "Poupança";
    case "investment":
      return "Investimento";
    case "credit_card":
      return "Cartão";
    default:
      return "Conta";
  }
}

function cardBarColor(pct: number): string {
  if (pct > 90) return "var(--color-danger)";
  if (pct > 70) return "var(--color-warning)";
  return "var(--color-primary)";
}

export default function WalletPage() {
  const { accounts, transactions, goals, debts, loading, error } = useAppState();

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

  const checkingAccounts = accounts.filter((a) => a.kind !== "credit_card");
  const creditCards = accounts.filter((a) => a.kind === "credit_card");

  const totalBalance = checkingAccounts.reduce(
    (s, a) => s + a.balanceCents,
    0,
  );
  const totalGoalsCurrent = goals.reduce((s, g) => s + g.currentAmountCents, 0);

  const cardSpending = creditCards.map((card) => {
    const spent = transactions
      .filter((t) => t.accountId === card.id && t.kind === "expense")
      .reduce((s, t) => s + t.amountCents, 0);
    return { ...card, spent };
  });
  const totalCardSpent = cardSpending.reduce((s, c) => s + c.spent, 0);

  const totalDebtRemaining = debts.reduce(
    (s, d) => s + (d.totalAmountCents - d.paidAmountCents),
    0,
  );

  const ativos = totalBalance + totalGoalsCurrent;
  const passivos = totalCardSpent + totalDebtRemaining;
  const netWorth = ativos - passivos;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        {error && (
          <div className="mx-5 mt-2 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">
            ⚠ {error}
          </div>
        )}

        {/* Hero verde (mock spec) */}
        <div
          className="px-[22px] pt-2 pb-6 text-white"
          style={{ background: "linear-gradient(165deg,#0F6B45,#0A3A28)" }}
        >
          <div className="my-[18px] text-[20px] font-extrabold">Patrimônio</div>
          <div className="mb-1 text-[12px] text-white/70">
            Patrimônio líquido
          </div>
          <div
            className="mb-4 font-mono text-[32px] font-semibold text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            {formatBRL(netWorth)}
          </div>

          {/* 4 mini-stats (mock spec) */}
          <div className="grid grid-cols-2 gap-[7px]">
            <div
              className="rounded-[13px] p-[10px_12px]"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[10px] text-white/70">
                Saldo em contas
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-white">
                {formatBRL(totalBalance)}
              </div>
            </div>
            <div
              className="rounded-[13px] p-[10px_12px]"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[10px] text-white/70">
                Reservas / Metas
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-white">
                {formatBRL(totalGoalsCurrent)}
              </div>
            </div>
            <div
              className="rounded-[13px] p-[10px_12px]"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[10px] text-white/70">
                Faturas abertas
              </div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-[#F9A8A2]">
                −{formatBRL(totalCardSpent)}
              </div>
            </div>
            <div
              className="rounded-[13px] p-[10px_12px]"
              style={{ background: "rgba(255,255,255,.12)" }}
            >
              <div className="mb-[3px] text-[10px] text-white/70">Dívidas</div>
              <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-semibold text-[#F9A8A2]">
                −{formatBRL(totalDebtRemaining)}
              </div>
            </div>
          </div>
        </div>

        {/* Contas section */}
        <div className="pt-[18px] px-5 pb-6">
          <div className="mb-[10px] flex items-center justify-between">
            <span className="text-[13px] font-bold text-text-primary">
              Contas
            </span>
            <Link
              href="/contas"
              className="text-[11px] font-semibold text-primary"
            >
              Gerenciar
            </Link>
          </div>

          <div className="mb-[22px] flex flex-col gap-[9px]">
            {checkingAccounts.map((acc) => (
              <div
                key={acc.id}
                className="flex cursor-pointer items-center gap-3 rounded-[15px] border border-border bg-surface px-[13px] py-[13px] shadow-card"
              >
                <Badge label={acc.name} color={acc.color ?? "#4A5568"} size="md" />
                <div className="flex-1">
                  <div className="text-[14px] font-semibold text-text-primary">
                    {acc.name}
                  </div>
                  <div className="text-[11px] text-text-muted">
                    {accountKindLabel(acc.kind)}
                  </div>
                </div>
                <div className="font-mono text-[14px] font-semibold text-text-primary">
                  {formatBRL(acc.balanceCents)}
                </div>
              </div>
            ))}

            <Link
              href="/contas"
              className="flex items-center justify-center gap-2 rounded-[15px] border-[1.5px] border-dashed px-3 py-[13px] text-[13px] font-semibold text-text-secondary"
              style={{ borderColor: "#CBD3CB" }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Adicionar conta
            </Link>
          </div>

          {/* Cartões section */}
          <div className="mb-[10px] flex items-center justify-between">
            <span className="text-[13px] font-bold text-text-primary">
              Cartões
            </span>
            <Link
              href="/cartoes"
              className="text-[11px] font-semibold text-primary"
            >
              Gerenciar
            </Link>
          </div>

          <div className="flex flex-col gap-[9px]">
            {cardSpending.map((card) => {
              const pct =
                card.creditLimitCents && card.creditLimitCents > 0
                  ? Math.min(
                      (card.spent / card.creditLimitCents) * 100,
                      100,
                    )
                  : 0;

              return (
                <div
                  key={card.id}
                  className="cursor-pointer rounded-[15px] border border-border bg-surface px-[13px] py-[13px] shadow-card"
                >
                  <div className="mb-[11px] flex items-center gap-3">
                    <Badge label={card.name} color={card.color ?? "#4A5568"} size="md" />
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-text-primary">
                        {card.name}
                      </div>
                      <div className="text-[11px] text-text-muted">
                        Vence dia {card.dueDay}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-[14px] font-semibold text-danger">
                        {formatBRL(card.spent)}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {formatBRL(
                          (card.creditLimitCents ?? 0) - card.spent,
                        )}{" "}
                        livre
                      </div>
                    </div>
                  </div>

                  <div className="h-[6px] rounded-[4px] bg-fill-medium">
                    <div
                      className="h-full rounded-[4px] transition-all"
                      style={{ width: `${pct}%`, background: cardBarColor(pct) }}
                    />
                  </div>
                </div>
              );
            })}

            <Link
              href="/cartoes"
              className="mt-[9px] flex w-full items-center justify-center gap-2 rounded-[15px] border-[1.5px] border-dashed px-3 py-[13px] text-[13px] font-semibold text-text-secondary"
              style={{ borderColor: "#CBD3CB" }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Adicionar cartão
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}