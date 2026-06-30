"use client";

import { useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
import { useAppState } from "@/lib/state/app-state-context";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function NewGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Nova meta">
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-primary-tint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <div className="text-center">
          <div className="text-[14px] font-bold text-text-primary">Criação de metas em breve</div>
          <div className="mt-1.5 text-[12px] text-text-muted">O backend de metas está sendo implementado. Por enquanto, acompanhe suas metas pré-configuradas.</div>
        </div>
        <button onClick={onClose} className="rounded-[13px] bg-fill-light px-5 py-2.5 text-[13px] font-bold text-text-secondary">
          Fechar
        </button>
      </div>
    </BottomSheet>
  );
}

export default function GoalsPage() {
  const { goals, debts, loading, error, writeError, clearWriteError } = useAppState();
  const [tab, setTab] = useState<"goals" | "debts">("goals");
  const [expandedDebt, setExpandedDebt] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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

  const goalPcts = goals.map((g) => {
    const pct = g.targetAmountCents > 0
      ? Math.min((g.currentAmountCents / g.targetAmountCents) * 100, 100) : 0;
    return { ...g, pct };
  });

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader
          title="Metas & Dívidas"
          action={
            <button type="button" onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-[15px] py-[9px] text-[12px] font-bold text-white">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Nova
            </button>
          }
        />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">⚠ {error}</div>
        )}

        <WriteErrorBanner message={writeError} onDismiss={clearWriteError} />

        <div className="px-5">
          <div className="mb-4 flex gap-1.5 rounded-[13px] border border-border bg-surface p-1">
            <button onClick={() => setTab("goals")}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${tab === "goals" ? "bg-primary text-white shadow-sm" : "text-text-muted"}`}>
              Metas
            </button>
            <button onClick={() => setTab("debts")}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${tab === "debts" ? "bg-primary text-white shadow-sm" : "text-text-muted"}`}>
              Dívidas
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-5">
          {tab === "goals" ? (
            goalPcts.length === 0 ? (
              <div className="py-[50px] text-center text-text-muted">
                <div className="text-[14px] font-semibold">Nenhuma meta</div>
                <div className="mt-1 text-[12px]">Crie uma meta financeira para começar.</div>
              </div>
            ) : (
              goalPcts.map((g) => (
                <div key={g.id} className="rounded-[16px] border border-border bg-surface px-4 py-4 shadow-card">
                  <div className="mb-[10px] flex items-center justify-between">
                    <div className="flex items-center gap-[9px]">
                      <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px] bg-primary-tint text-primary">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 22V4a1 1 0 0 1 1-1h12l-3 4 3 4H6" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-text-primary">{g.name}</div>
                        <div className="text-[11px] text-text-muted">
                          {g.goalType === "emergency_fund" ? "Reserva de emergência"
                            : g.goalType === "savings" ? "Poupança"
                            : g.goalType === "debt_payoff" ? "Quitação de dívida"
                            : g.goalType === "purchase" ? "Compra planejada" : "Meta"}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[14px] font-bold text-primary">{formatPct(g.pct)}</span>
                  </div>
                  <div className="mb-[6px] h-2 rounded-full bg-fill-medium">
                    <div className="h-full rounded-full transition-all" style={{ width: `${g.pct}%`, background: "linear-gradient(90deg, #0E8C5A, #2FA56F)" }} />
                  </div>
                  <div className="mb-2 text-[11px] text-text-muted">{formatPct(g.pct)} concluído</div>
                  <div className="flex justify-between text-[12px] text-text-secondary">
                    <span className="font-mono font-semibold text-text-primary">{formatBRL(g.currentAmountCents)}</span>
                    <span>de {formatBRL(g.targetAmountCents)}</span>
                  </div>
                </div>
              ))
            )
          ) : debts.length === 0 ? (
            <div className="py-[50px] text-center text-text-muted">
              <div className="text-[14px] font-semibold">Dívidas em breve</div>
              <div className="mt-1 text-[12px]">
                O acompanhamento de dívidas ainda não está disponível.
              </div>
            </div>
          ) : (
            debts.map((d) => {
              const remaining = d.totalAmountCents - d.paidAmountCents;
              const pct = d.totalAmountCents > 0
                ? Math.min((d.paidAmountCents / d.totalAmountCents) * 100, 100) : 0;

              return (
                <div key={d.id} className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-card">
                  <div className="px-4 pb-2 pt-4">
                    <div className="mb-[14px] flex items-start gap-2.5">
                      <div className="flex h-[40px] w-[40px] flex-none items-center justify-center rounded-[12px] bg-danger-tint text-danger">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-[15px] font-bold text-text-primary">{d.name}</div>
                        <div className="text-[11px] text-text-muted">
                          {d.interestRate > 0 ? `${(d.interestRate * 100).toFixed(1)}% a.m.` : "Sem juros"} · {d.installmentsPaid}/{d.installmentsTotal} parcelas
                        </div>
                      </div>
                      <span className="flex-none rounded-[9px] bg-fill-light px-3 py-[7px] text-[10px] font-bold text-text-muted opacity-50">
                        Em breve
                      </span>
                    </div>

                    <div className="mb-[14px] grid grid-cols-3 gap-2">
                      <div className="rounded-[11px] bg-fill-light px-3 py-2.5">
                        <div className="text-[10px] text-text-muted">Pago</div>
                        <div className="font-mono text-[13px] font-bold text-primary">{formatBRL(d.paidAmountCents)}</div>
                      </div>
                      <div className="rounded-[11px] bg-fill-light px-3 py-2.5">
                        <div className="text-[10px] text-text-muted">Restante</div>
                        <div className="font-mono text-[13px] font-bold text-danger">{formatBRL(remaining)}</div>
                      </div>
                      <div className="rounded-[11px] bg-fill-light px-3 py-2.5">
                        <div className="text-[10px] text-text-muted">Total</div>
                        <div className="font-mono text-[13px] font-bold text-text-primary">{formatBRL(d.totalAmountCents)}</div>
                      </div>
                    </div>

                    <div className="mb-[6px] h-[7px] rounded-[5px] bg-fill-medium">
                      <div className="h-full rounded-[5px] transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #0E8C5A, #2FA56F)" }} />
                    </div>
                    <div className="mb-3.5 text-[11px] text-text-muted">{formatPct(pct)} quitado</div>

                    {/* Próxima parcela — non-interactive */}
                    {d.installmentsTotal - d.installmentsPaid >= 1 && (() => {
                      const monthlyAmount = Math.round(d.totalAmountCents / d.installmentsTotal);
                      const dueDate = new Date();
                      dueDate.setMonth(dueDate.getMonth() + 1);
                      const monthLabel = dueDate.toLocaleDateString("pt-BR", { month: "long" });
                      return (
                        <div className="mb-3.5 flex items-center gap-3 rounded-[13px] border px-3.5 py-3"
                          style={{ background: "linear-gradient(135deg, #FBF1E3, #FFF8EE)", borderColor: "#F0DFC0" }}>
                          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]" style={{ background: "#B8791F22" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B8791F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </div>
                          <div className="flex-1">
                            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: "#B8791F" }}>Próxima parcela</div>
                            <div className="text-[13px] font-semibold text-text-primary">{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)} · {formatBRL(monthlyAmount)}</div>
                          </div>
                          <span className="rounded-[9px] bg-white/60 px-3 py-2 text-[10px] font-bold text-text-muted">Em breve</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Dot grid */}
                  <div className="border-t border-fill-medium px-4 pb-3 pt-3">
                    <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-text-muted">Todas as parcelas</div>
                    <div className="flex flex-wrap gap-[5px]">
                      {Array.from({ length: d.installmentsTotal }, (_, i) => {
                        const idx = i + 1;
                        const isPaid = idx <= d.installmentsPaid;
                        const isCurrent = idx === d.installmentsPaid + 1;
                        return (
                          <div key={idx}
                            className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-[8px] text-[9px] font-bold"
                            style={isPaid ? { background: "#0E8C5A" } : isCurrent ? { background: "#FBF1E3", border: "1.5px solid #B8791F" } : { background: "#F1F3EF" }}>
                            {isPaid ? (
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                            ) : isCurrent ? <span className="block h-[7px] w-[7px] rounded-full" style={{ background: "#B8791F" }} />
                            : <span className="font-mono" style={{ color: "#C4CAC5" }}>{idx}</span>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-3 text-[10px] text-text-muted">
                      <span className="flex items-center gap-1.5"><span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: "#0E8C5A" }} /> Pago</span>
                      <span className="flex items-center gap-1.5"><span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: "#FBF1E3", border: "1.5px solid #B8791F" }} /> Atual</span>
                      <span className="flex items-center gap-1.5"><span className="h-[10px] w-[10px] rounded-[3px]" style={{ background: "#F1F3EF" }} /> Pendente</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      <NewGoalSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
