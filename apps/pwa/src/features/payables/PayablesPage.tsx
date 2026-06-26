"use client";

import { useMemo, useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { useAppState } from "@/lib/state/app-state-context";
import type { Payable } from "@/lib/state/types";

function formatInputBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10).toLocaleString("pt-BR")},${decPart}`;
}

function NewPayableSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Nova conta a pagar">
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-primary-tint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <div className="text-center">
          <div className="text-[14px] font-bold text-text-primary">Criação de contas em breve</div>
          <div className="mt-1.5 text-[12px] text-text-muted">O backend de contas a pagar está sendo implementado. Por enquanto você pode marcar contas como pagas.</div>
        </div>
        <button onClick={onClose} className="rounded-[13px] bg-fill-light px-5 py-2.5 text-[13px] font-bold text-text-secondary">
          Fechar
        </button>
      </div>
    </BottomSheet>
  );
}

type StatusFilter = "all" | "overdue" | "pending" | "paid";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDayMonth(dateStr: string): { day: string; mon: string } {
  const d = new Date(dateStr + "T12:00:00");
  return {
    day: String(d.getDate()),
    mon: d
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", ""),
  };
}

const todayStr = new Date().toISOString().slice(0, 10);
const today = new Date(todayStr + "T12:00:00");

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface PayableWithStatus extends Payable {
  derivedStatus: "paid" | "overdue" | "pending";
}

interface PayableGroup {
  key: string;
  title: string;
  color: string;
  items: PayableWithStatus[];
}

export default function PayablesPage() {
  const { payables, categories, markPayablePaid, loading, error } = useAppState();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const deriveStatus = (p: Payable): "paid" | "overdue" | "pending" => {
    if (p.status === "paid") return "paid";
    if (p.status === "overdue") return "overdue";
    if (p.status === "cancelled") return "paid"; // treat cancelled as done
    const d = daysUntil(p.dueDate);
    if (d < 0) return "overdue";
    return "pending";
  };

  const payablesWithStatus = useMemo(
    (): PayableWithStatus[] =>
      payables.map((p) => ({
        ...p,
        derivedStatus: deriveStatus(p),
      })),
    [payables],
  );

  const filtered = useMemo((): PayableWithStatus[] => {
    if (statusFilter === "all") return payablesWithStatus;
    return payablesWithStatus.filter(
      (p) => p.derivedStatus === statusFilter,
    );
  }, [payablesWithStatus, statusFilter]);

  const groups = useMemo(() => {
    const overdue: PayableWithStatus[] = [];
    const upcoming: PayableWithStatus[] = [];
    const paid: PayableWithStatus[] = [];

    for (const p of filtered) {
      if (p.derivedStatus === "paid") {
        paid.push(p);
      } else if (p.derivedStatus === "overdue") {
        overdue.push(p);
      } else {
        // pending
        const d = daysUntil(p.dueDate);
        if (d <= 7) {
          upcoming.push(p);
        } else {
          // Further out — also show as upcoming with longer label
          upcoming.push(p);
        }
      }
    }

    const result: PayableGroup[] = [];
    if (overdue.length > 0) {
      result.push({
        key: "overdue",
        title: `Vencidas · ${overdue.length}`,
        color: "var(--color-danger)",
        items: overdue.sort((a, b) =>
          a.dueDate.localeCompare(b.dueDate),
        ),
      });
    }
    if (upcoming.length > 0) {
      result.push({
        key: "upcoming",
        title: `Próximas · ${upcoming.length}`,
        color: "var(--color-warning)",
        items: upcoming.sort((a, b) =>
          a.dueDate.localeCompare(b.dueDate),
        ),
      });
    }
    if (paid.length > 0) {
      result.push({
        key: "paid",
        title: `Pagas · ${paid.length}`,
        color: "var(--color-primary)",
        items: paid.sort((a, b) =>
          b.dueDate.localeCompare(a.dueDate),
        ),
      });
    }
    return result;
  }, [filtered]);

  const totalCents = payables.reduce((s, p) => s + p.amountCents, 0);
  const paidCents = payables
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amountCents, 0);
  const pendingCents = payables
    .filter((p) => p.status === "pending" || p.status === "overdue")
    .reduce((s, p) => s + p.amountCents, 0);

  function getCategory(id?: string): string {
    if (!id) return "";
    return categories.find((c) => c.id === id)?.name ?? "";
  }

  const filterChips: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "overdue", label: "Vencidas" },
    { key: "pending", label: "Próximas" },
    { key: "paid", label: "Pagas" },
  ];

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

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader
          title="Contas a pagar"
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

        <div className="px-5">
          {/* KPI card */}
          <div
            className="mb-4 overflow-hidden rounded-[16px] px-4 py-4 text-white shadow-card"
            style={{
              background: "linear-gradient(165deg, #0F6B45, #0A3A28)",
            }}
          >
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div>
                <div className="mb-1 text-[10px] text-white/70">Total</div>
                <div className="font-mono text-[16px] font-semibold">
                  {formatBRL(totalCents)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] text-white/70">Pago</div>
                <div className="font-mono text-[16px] font-semibold text-[#7FE3B0]">
                  {formatBRL(paidCents)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] text-white/70">A pagar</div>
                <div className="font-mono text-[16px] font-semibold text-[#F9A8A2]">
                  {formatBRL(pendingCents)}
                </div>
              </div>
            </div>
          </div>

          {/* Filter chips */}
          <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-hide">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={() =>
                  setStatusFilter(
                    chip.key === statusFilter ? "all" : chip.key,
                  )
                }
                className={`flex-none rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                  statusFilter === chip.key
                    ? "bg-primary text-white"
                    : "bg-fill-light text-text-secondary"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4 px-5">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-2.5 flex items-center gap-2">
                <span
                  className="h-[7px] w-[7px] flex-none rounded-full"
                  style={{ background: group.color }}
                />
                <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  {group.title}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {group.items.map((p) => {
                  const dm = formatDayMonth(p.dueDate);
                  const isPaid = p.status === "paid";
                  const isOverdue = p.derivedStatus === "overdue";
                  const borderColor = isPaid
                    ? "var(--color-border)"
                    : isOverdue
                      ? "var(--color-danger-tint)"
                      : "var(--color-border)";
                  const opacity = isPaid ? "0.6" : "1";
                  const iconBg = isPaid
                    ? "#E7F3EC"
                    : isOverdue
                      ? "#F7E9E7"
                      : "#F4F5F2";
                  const iconColor = isPaid
                    ? "var(--color-primary)"
                    : isOverdue
                      ? "var(--color-danger)"
                      : "var(--color-text-secondary)";

                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-[14px] bg-surface px-4 py-3.5 shadow-card"
                      style={{
                        border: `1px solid ${borderColor}`,
                        opacity,
                      }}
                    >
                      {/* Date badge */}
                      <div
                        className="flex h-[42px] w-[42px] flex-none flex-col items-center justify-center rounded-[12px] font-mono font-bold leading-none"
                        style={{
                          background: iconBg,
                          color: iconColor,
                        }}
                      >
                        <span className="text-[14px]">{dm.day}</span>
                        <span className="text-[8px] uppercase">
                          {dm.mon}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-text-primary">
                          {p.description}
                        </div>
                        <div
                          className="text-[11px]"
                          style={{
                            color: isOverdue
                              ? "var(--color-danger)"
                              : "var(--color-text-muted)",
                          }}
                        >
                          {getCategory(p.categoryId)}
                          {p.categoryId && " · "}
                          {isOverdue
                            ? `Venceu ${p.dueDate}`
                            : `Vence ${p.dueDate}`}
                        </div>
                      </div>

                      {/* Amount + action */}
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="font-mono text-[14px] font-semibold text-text-primary">
                          {formatBRL(p.amountCents)}
                        </div>
                        {p.status !== "paid" &&
                          p.status !== "cancelled" && (
                            <button
                              onClick={() => markPayablePaid(p.id)}
                              className="text-[10px] font-bold text-primary"
                            >
                              ✓ Pago
                            </button>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {groups.length === 0 && (
            <div className="py-[50px] text-center text-text-muted">
              <div className="text-[14px] font-semibold">
                Nada encontrado
              </div>
              <div className="mt-1 text-[12px]">
                Nenhuma conta com este status.
              </div>
            </div>
          )}
        </div>
      </main>

      <NewPayableSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
