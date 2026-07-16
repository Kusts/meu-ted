"use client";

import { useEffect, useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
import { StaleBanner } from "@/components/StaleBanner";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { useAppState } from "@/lib/state/app-state-context";
import { useFormDirtySafe } from "@/lib/unsaved-changes";
import type { Goal } from "@/lib/state/types";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatInputBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10).toLocaleString("pt-BR")},${decPart}`;
}

function parseBRLToCents(value: string): number {
  const cleaned = value.replace(/[.\s]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

function NewGoalSheet({
  open,
  onClose,
  onSave,
  initialType,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    goalType: "savings" | "purchase" | "debt_payoff" | "emergency_fund";
    targetAmountCents: number;
    startDate: string;
  }) => void;
  initialType?: "debt_payoff";
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"savings" | "purchase" | "debt_payoff" | "emergency_fund">("savings");
  const [targetStr, setTargetStr] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialType) setType(initialType);
  }, [initialType]);

  // Reset draft whenever the sheet closes (outside click, escape, programmatic
  // close, or successful save). Without this, a typed-but-not-saved draft leaks
  // into the next open and risks being submitted accidentally.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName("");
      setTargetStr("");
      setType("savings");
    }
  }, [open]);

  function handleSave() {
    if (!name.trim()) return;
    const targetAmountCents = parseBRLToCents(targetStr);
    if (targetAmountCents <= 0) return;
    onSave({
      name: name.trim(),
      goalType: type,
      targetAmountCents,
      startDate: new Date().toISOString().slice(0, 10),
    });
    setName("");
    setTargetStr("");
    onClose();
  }

  const types = [
    { value: "savings" as const, label: "Poupança" },
    { value: "purchase" as const, label: "Compra" },
    { value: "debt_payoff" as const, label: "Quitar dívida" },
    { value: "emergency_fund" as const, label: "Reserva" },
  ];

  return (
    <BottomSheet open={open} onClose={onClose} title="Nova meta">
      <div className="flex flex-col gap-4">
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Nome
          </label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Viagem, Carro novo..."
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
        </fieldset>
        {!initialType && (
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Tipo</label>
            <div className="flex flex-wrap gap-2">
              {types.map((t) => (
                <button key={t.value} type="button" onClick={() => setType(t.value)}
                  className={`rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${type === t.value ? "bg-primary text-white" : "bg-fill-light text-text-secondary"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Valor alvo (R$)</label>
          <input type="text" inputMode="numeric" value={targetStr}
            onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setTargetStr(formatInputBRL(raw)); }}
            placeholder="0,00"
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 font-mono text-[16px] font-semibold text-text-primary outline-none focus:border-primary" />
        </fieldset>
        <button type="button" onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90">
          Salvar meta
        </button>
      </div>
    </BottomSheet>
  );
}

function ContributeSheet({
  open,
  goal,
  onClose,
  onContribute,
}: {
  open: boolean;
  goal: Goal | null;
  onClose: () => void;
  onContribute: (id: string, amountCents: number) => void;
}) {
  const [amountStr, setAmountStr] = useState("");

  // Reset draft whenever the sheet closes (outside click, escape, programmatic
  // close, or successful save). Without this, a typed-but-not-saved amount leaks
  // into the next open and risks being submitted accidentally.
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountStr("");
    }
  }, [open]);

  function handleSave() {
    if (!goal) return;
    const amountCents = parseBRLToCents(amountStr);
    if (amountCents <= 0) return;
    onContribute(goal.id, amountCents);
    setAmountStr("");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Adicionar valor">
      <div className="flex flex-col gap-4">
        {goal && (
          <div className="text-center">
            <div className="text-[13px] font-semibold text-text-primary">{goal.name}</div>
            <div className="text-[11px] text-text-muted">
              {formatPct(Math.min((goal.currentAmountCents / goal.targetAmountCents) * 100, 100))} concluído
            </div>
          </div>
        )}
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Valor (R$)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">R$</span>
            <input type="text" inputMode="numeric" value={amountStr}
              onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setAmountStr(formatInputBRL(raw)); }}
              placeholder="0,00"
              className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none focus:border-primary" />
          </div>
        </fieldset>
        <button type="button" onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90">
          Adicionar
        </button>
      </div>
    </BottomSheet>
  );
}

function GoalDetailSheet({
  goal,
  open,
  onClose,
  onEdit,
}: {
  goal: Goal | null;
  open: boolean;
  onClose: () => void;
  onEdit: (id: string, input: { name?: string; targetAmountCents?: number }) => void | Promise<void>;
}) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState("");
  const [targetDisplay, setTargetDisplay] = useState("");

  useEffect(() => {
    if (goal && open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(goal.name);
      setTargetDisplay(formatInputBRL(String(goal.targetAmountCents)));
      setEditMode(false);
      markClean();
    }
  }, [goal, open, markClean]);

  if (!goal) return null;

  const pct = goal.targetAmountCents > 0 ? Math.min((goal.currentAmountCents / goal.targetAmountCents) * 100, 100) : 0;

  function handleClose() {
    markClean();
    onClose();
  }

  async function handleSave() {
    if (!goal) return;
    const targetAmountCents = parseBRLToCents(targetDisplay);
    if (targetAmountCents <= 0) return;
    try {
      await onEdit(goal.id, { name: name.trim() || undefined, targetAmountCents });
      markClean();
      onClose();
    } catch {
      // Save failed: keep dirty.
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title={editMode ? "Editar meta" : "Detalhes da meta"}>
      {editMode ? (
        <div className="flex flex-col gap-4" onChangeCapture={markDirty}>
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Nome</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
          </fieldset>
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Valor alvo (R$)</label>
            <input type="text" inputMode="numeric" value={targetDisplay}
              onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setTargetDisplay(formatInputBRL(raw)); }}
              placeholder="0,00"
              className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 font-mono text-[16px] font-semibold text-text-primary outline-none focus:border-primary" />
          </fieldset>
          <button type="button" onClick={handleSave}
            disabled={parseBRLToCents(targetDisplay) <= 0}
            className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            Salvar alterações
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px] bg-primary-tint text-primary">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 22V4a1 1 0 0 1 1-1h12l-3 4 3 4H6" />
              </svg>
            </div>
            <div>
              <div className="text-[14px] font-semibold text-text-primary">{goal.name}</div>
              <div className="text-[11px] text-text-muted">
                {goal.goalType === "emergency_fund" ? "Reserva de emergência"
                  : goal.goalType === "savings" ? "Poupança"
                  : goal.goalType === "debt_payoff" ? "Quitação de dívida"
                  : goal.goalType === "purchase" ? "Compra planejada" : "Meta"}
              </div>
            </div>
          </div>
          <div className="h-2 rounded-full bg-fill-medium">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #0E8C5A, #2FA56F)" }} />
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="font-mono font-semibold text-text-primary">{formatBRL(goal.currentAmountCents)}</span>
            <span className="text-text-muted">de {formatBRL(goal.targetAmountCents)}</span>
          </div>
          <div className="text-center text-[11px] text-text-muted">{formatPct(pct)} concluído</div>
          <button type="button" onClick={() => setEditMode(true)}
            className="w-full rounded-[14px] bg-fill-light py-[14px] text-center text-[14px] font-bold text-text-primary">
            Editar
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

export default function GoalsPage() {
  const { goals, debts, loading, error, writeError, clearWriteError, createGoal, contributeToGoal, cancelGoal, updateGoal } = useAppState();
  const [tab, setTab] = useState<"goals" | "debts">("goals");
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"goal" | "debt" | null>(null);
  const [chooseOpen, setChooseOpen] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Goal | null>(null);
  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);

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

  // Dívidas tab shows both real Debt items and goals with goalType='debt_payoff'
  const debtGoals = goals.filter((g) => g.goalType === "debt_payoff");
  const visibleDebts = debts.length > 0 || debtGoals.length > 0;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader
          title="Metas & Dívidas"
          action={
            <button type="button" onClick={() => setChooseOpen(true)}
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

        <StaleBanner domains={["goals"]} />

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
                  <div className="cursor-pointer" onClick={() => setDetailGoal(g)}>
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
                  <div className="mb-3 flex justify-between text-[12px] text-text-secondary">
                    <span className="font-mono font-semibold text-text-primary">{formatBRL(g.currentAmountCents)}</span>
                    <span>de {formatBRL(g.targetAmountCents)}</span>
                  </div>
                </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setContributeGoal(g)}
                      className="flex-1 rounded-[10px] bg-primary py-2.5 text-center text-[12px] font-bold text-white">
                      Adicionar
                    </button>
                    <button type="button" onClick={() => setConfirmCancel(g)}
                      className="flex-1 rounded-[10px] bg-danger-tint py-2.5 text-center text-[12px] font-bold text-danger">
                      Cancelar
                    </button>
                  </div>
                </div>
              ))
            )
          ) : !visibleDebts ? (
            <div className="py-[50px] text-center text-text-muted">
              <div className="text-[14px] font-semibold">Nenhuma dívida</div>
              <div className="mt-1 text-[12px]">
                Crie uma dívida pelo botão Nova.
              </div>
            </div>
          ) : (
            <>
            {debts.map((d) => {
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
            })}
            {debtGoals.map((g) => {
              const pct = g.targetAmountCents > 0
                ? Math.min((g.currentAmountCents / g.targetAmountCents) * 100, 100) : 0;
              return (
                <div key={g.id} className="rounded-[16px] border border-border bg-surface px-4 py-4 shadow-card">
                  <div className="cursor-pointer" onClick={() => setDetailGoal(g)}>
                    <div className="mb-[10px] flex items-center gap-[9px]">
                      <div className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px] bg-danger-tint text-danger">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-[14px] font-semibold text-text-primary">{g.name}</div>
                        <div className="text-[11px] text-text-muted">Quitação de dívida</div>
                      </div>
                    </div>
                    <div className="mb-[6px] h-2 rounded-full bg-fill-medium">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #0E8C5A, #2FA56F)" }} />
                    </div>
                    <div className="flex justify-between text-[12px]">
                      <span className="font-mono font-semibold text-text-primary">{formatBRL(g.currentAmountCents)}</span>
                      <span className="text-text-muted">de {formatBRL(g.targetAmountCents)}</span>
                    </div>
                  </div>
                  <div className="mt-3 text-[11px] text-text-muted">{formatPct(pct)} quitado</div>
                  <div className="mt-3 flex gap-2">
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setContributeGoal(g); }}
                      className="flex-1 rounded-[10px] bg-primary py-2.5 text-center text-[12px] font-bold text-white">
                      Adicionar
                    </button>
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmCancel(g); }}
                      className="flex-1 rounded-[10px] bg-danger-tint py-2.5 text-center text-[12px] font-bold text-danger">
                      Cancelar
                    </button>
                  </div>
                </div>
              );
            })}
            </>
          )}
        </div>
      </main>

      {/* Chooser for Nova */}
      <BottomSheet open={chooseOpen} onClose={() => setChooseOpen(false)} title="Nova entrada">
        <div className="flex flex-col gap-4">
          <button type="button" onClick={() => { setChooseOpen(false); setCreateType("goal"); setCreateOpen(true); }}
            className="w-full rounded-[16px] border-2 border-border bg-surface p-5 text-center transition-colors hover:border-primary">
            <div className="text-[16px] font-bold text-text-primary">Meta financeira</div>
            <div className="mt-1 text-[12px] text-text-muted">Defina uma meta de poupança, reserva ou compra.</div>
          </button>
          <button type="button" onClick={() => { setChooseOpen(false); setCreateType("debt"); setCreateOpen(true); }}
            className="w-full rounded-[16px] border-2 border-border bg-surface p-5 text-center transition-colors hover:border-primary">
            <div className="text-[16px] font-bold text-text-primary">Dívida</div>
            <div className="mt-1 text-[12px] text-text-muted">Registre uma dívida para acompanhar o pagamento.</div>
          </button>
        </div>
      </BottomSheet>

      <NewGoalSheet
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateType(null); }}
        onSave={createGoal}
        initialType={createType === "debt" ? "debt_payoff" : undefined}
      />

      <ContributeSheet
        open={contributeGoal !== null}
        goal={contributeGoal}
        onClose={() => setContributeGoal(null)}
        onContribute={(id, amountCents) =>
          contributeToGoal(id, { amountCents })
        }
      />

      <ConfirmActionDialog
        open={confirmCancel !== null}
        title="Cancelar meta"
        message={`Tem certeza que deseja cancelar a meta "${confirmCancel?.name ?? ""}"? Esta ação pode ser desfeita.`}
        confirmLabel="Cancelar meta"
        danger
        onConfirm={() => {
          if (confirmCancel) cancelGoal(confirmCancel.id);
          setConfirmCancel(null);
        }}
        onCancel={() => setConfirmCancel(null)}
      />

      <GoalDetailSheet
        goal={detailGoal}
        open={detailGoal !== null}
        onClose={() => setDetailGoal(null)}
        onEdit={(id, input) => updateGoal(id, input)}
      />
    </div>
  );
}
