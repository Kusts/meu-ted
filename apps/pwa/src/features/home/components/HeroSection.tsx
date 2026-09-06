"use client";

import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { formatBRL } from "@/lib/format/brl";
import { HERO_BACKGROUND } from "../hero";
import { Bell, Eye, EyeOff } from "lucide-react";

export interface HeroProfile {
  name: string;
  avatarColor: string;
}

interface HeroSectionProps {
  profile: HeroProfile;
  pendingCount: number | null;
  totalBalance: number | null;
  totalIncome: number | null;
  totalExpenses: number | null;
  netResult: number | null;
  /** P3 — saldo oculto (máscara) vs. visível. */
  balanceHidden: boolean;
  onToggleBalance: () => void;
  /** P4 — saldo animado (centavos) exibido quando visível. */
  animatedBalance: number;
  onOpenProfile: () => void;
  onOpenNotifications: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "Boa madrugada";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function HeroSection({
  profile,
  pendingCount,
  totalBalance,
  totalIncome,
  totalExpenses,
  netResult,
  balanceHidden,
  onToggleBalance,
  animatedBalance,
  onOpenProfile,
  onOpenNotifications,
}: HeroSectionProps) {
  return (
    <div
      data-testid="hero-area"
      className="px-5 pt-[calc(8px+env(safe-area-inset-top))] sm:px-8 lg:px-12"
      style={{
        background: HERO_BACKGROUND,
        paddingBottom: 24,
      }}
    >
      {/* Header: avatar + greeting + bell */}
      <div className="mb-5 mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenProfile}
            aria-label="Abrir perfil"
            className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full font-mono text-[15px] font-semibold text-white shadow-sm ring-1 ring-white/10"
            style={{ background: profile.avatarColor }}
          >
            {(profile.name ?? "?").charAt(0).toUpperCase()}
          </button>
          <div>
            <div className="text-xs text-white/70">
              {greeting()}
            </div>
            <div className="text-[15px] font-bold text-white tracking-tight">{profile.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="lg:hidden">
            <WorkspaceSwitcher compact variant="hero" />
          </div>
          <button
            type="button"
            aria-label="Notificações"
            onClick={onOpenNotifications}
            className="relative flex h-[38px] w-[38px] items-center justify-center rounded-full text-white transition-all hover:bg-white/20 active:scale-95"
            style={{ background: "rgba(255,255,255,.14)" }}
          >
            <Bell size={18} strokeWidth={2} />
            {/* A9: dot via tokens e só quando há algo pedindo atenção
                (operações pendentes de aprovação) */}
            {pendingCount !== null && pendingCount > 0 && (
              <div
                aria-hidden="true"
                className="absolute right-[9px] top-[8px] h-[7px] w-[7px] rounded-full bg-warning ring-1 ring-white/40"
              />
            )}
          </button>
        </div>
      </div>

      {/* Page heading */}
      <h1 className="mb-[3px] text-[10px] font-bold uppercase tracking-wider text-white/60">
        Resumo financeiro
      </h1>

      {/* Saldo */}
      <div className="mb-[5px] flex items-center gap-2 text-xs font-medium text-white/80">
        <span>Saldo total · contas</span>
        {/* P3 — ocultar/mostrar saldo (persistido) */}
        <button
          type="button"
          onClick={onToggleBalance}
          aria-pressed={balanceHidden}
          aria-label={balanceHidden ? "Mostrar saldo" : "Ocultar saldo"}
          className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-white/80 transition-all hover:bg-white/20 hover:text-white active:scale-95"
        >
          {balanceHidden ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      <div
        className="mb-[18px] font-mono tabular-nums text-[38px] sm:text-[44px] font-bold text-white tracking-tight"
        style={{ letterSpacing: "-0.02em", lineHeight: 1 }}
      >
        {totalBalance !== null
          ? balanceHidden
            ? "R$ ••••••"
            : formatBRL(animatedBalance)
          : "—"}
      </div>

      {/* Mini-stats row */}
      <div className="flex gap-[9px]">
        <div
          className="flex-1 rounded-[14px] p-[10px_12px] border border-white/10"
          style={{ background: "rgba(255,255,255,.12)" }}
        >
          <div className="mb-[3px] text-[11px] font-medium text-white/70">Receitas</div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[13px] font-semibold text-white">
            {totalIncome !== null ? formatBRL(totalIncome) : "—"}
          </div>
        </div>
        <div
          className="flex-1 rounded-[14px] p-[10px_12px] border border-white/10"
          style={{ background: "rgba(255,255,255,.12)" }}
        >
          <div className="mb-[3px] text-[11px] font-medium text-white/70">Despesas</div>
          <div className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[13px] font-semibold text-white">
            {totalExpenses !== null ? formatBRL(totalExpenses) : "—"}
          </div>
        </div>
        <div
          className="flex-1 rounded-[14px] p-[10px_12px] border border-white/10"
          style={{ background: "rgba(255,255,255,.12)" }}
        >
          <div className="mb-[3px] text-[11px] font-medium text-white/70">Resultado</div>
          <div
            className="overflow-hidden text-ellipsis whitespace-nowrap font-mono tabular-nums text-[13px] font-semibold"
            style={{
              color:
                netResult === null
                  ? "rgba(255,255,255,0.7)"
                  : netResult >= 0
                    ? "#7FE3B0"
                    : "#F9A8A2",
            }}
          >
            {netResult !== null ? formatBRL(netResult) : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
