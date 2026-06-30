"use client";

import { useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import Badge from "@/components/ui/Badge";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
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

const SUB_COLORS: Record<string, string> = {
  Netflix: "#E50914",
  Spotify: "#1DB954",
  "Amazon Prime": "#00A8E1",
  "Disney+": "#113CCF",
  Azure: "#0089D6",
  "YouTube Premium": "#FF0000",
  "ChatGPT Plus": "#10A37F",
};

function subColor(name: string): string {
  for (const [key, color] of Object.entries(SUB_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return "#3E6FB0";
}



const SERVICE_PRESETS = [
  { name: "Netflix" },
  { name: "Spotify" },
  { name: "Amazon Prime" },
  { name: "Disney+" },
  { name: "YouTube Premium" },
  { name: "ChatGPT Plus" },
];

const CYCLE_OPTIONS = [
  { value: "monthly", label: "Mensal" },
  { value: "yearly", label: "Anual" },
];

const PAYMENT_OPTIONS = [
  { value: "card", label: "Cartão" },
  { value: "boleto", label: "Boleto" },
  { value: "pix", label: "PIX" },
  { value: "manual", label: "Manual" },
];

function parseBRLToCents(value: string): number {
  const cleaned = value.replace(/[.\s]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

function NewSubscriptionSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (input: { name: string; amountCents: number; cycle: "monthly" | "yearly" | "weekly"; day: number; paymentMethod: string }) => void;
}) {
  const [service, setService] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cycle, setCycle] = useState("monthly");
  const [payment, setPayment] = useState("card");
  const [day, setDay] = useState("");

  function handleSave() {
    onAdd({
      name: name.trim() || service || "Assinatura",
      amountCents: parseBRLToCents(amount),
      cycle: cycle as "monthly" | "yearly" | "weekly",
      day: parseInt(day, 10) || 1,
      paymentMethod: payment === "card" ? "credit_card" : payment === "boleto" ? "boleto" : payment === "pix" ? "pix" : "manual",
    });
    setName("");
    setAmount("");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nova assinatura">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Serviço
          </label>
          <div className="flex flex-wrap gap-2">
            {SERVICE_PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setService(p.name);
                  setName(p.name);
                }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                  service === p.name
                    ? "bg-primary text-white"
                    : "bg-fill-light text-text-secondary"
                }`}
              >
                {p.name}
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
            placeholder="Ex: Netflix"
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-primary"
          />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Valor
          </label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">
              R$
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/\D/g, "");
                if (raw.length > 12) return;
                setAmount(formatInputBRL(raw));
              }}
              placeholder="0,00"
              className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none transition-colors focus:border-primary"
            />
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Ciclo
          </label>
          <div className="flex gap-1 rounded-xl bg-fill-light p-1">
            {CYCLE_OPTIONS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCycle(c.value)}
                className={`flex-1 rounded-[10px] py-2 text-center text-[12px] font-bold transition-colors ${
                  cycle === c.value
                    ? "bg-surface text-text-primary shadow-sm"
                    : "text-text-muted"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Cobrado via
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PAYMENT_OPTIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPayment(p.value)}
                className={`rounded-[100px] px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  payment === p.value
                    ? "bg-primary text-white"
                    : "bg-fill-light text-text-secondary"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Dia da cobrança
          </label>
          <input
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) => setDay(e.target.value)}
            placeholder="1 a 31"
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none transition-colors focus:border-primary"
          />
        </fieldset>

        <button
          type="button"
          onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Salvar assinatura
        </button>
      </div>
    </BottomSheet>
  );
}

export default function SubscriptionsPage() {
  const { subscriptions, addSubscription, writeError, clearWriteError } = useAppState();
  const [tab, setTab] = useState<"active" | "cancelled">("active");
  const [createOpen, setCreateOpen] = useState(false);

  const active = subscriptions.filter((s) => s.status === "active");
  const cancelled = subscriptions.filter((s) => s.status === "cancelled");

  // Monthly total — yearly subscriptions counted as monthly
  const monthlyTotal = subscriptions
    .filter((s) => s.status === "active")
    .reduce((s, sub) => {
      return s + (sub.cycle === "yearly" ? sub.amountCents / 12 : sub.amountCents);
    }, 0);

  const displayed = tab === "active" ? active : cancelled;

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader
          title="Assinaturas"
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

        <WriteErrorBanner message={writeError} onDismiss={clearWriteError} />

        {/* Monthly total hero */}
        <div
          className="mx-5 mb-4 overflow-hidden rounded-[16px] px-4 py-4 text-white shadow-card"
          style={{ background: "linear-gradient(165deg, #0F6B45, #0A3A28)" }}
        >
          <div className="mb-1 text-[12px] text-white/70">
            Custo mensal recorrente
          </div>
          <div className="mb-1 font-mono text-[26px] font-semibold tracking-tight text-white">
            {formatBRL(Math.round(monthlyTotal))}
          </div>
          <div className="text-[11px] text-white/70">
            {active.length} ativa{active.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Tabs */}
        <div className="mx-5 mb-4 flex gap-1.5 rounded-[13px] border border-border bg-surface p-1">
          {(["active", "cancelled"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition-colors ${
                tab === t
                  ? "bg-primary text-white"
                  : "bg-transparent text-text-muted"
              }`}
            >
              {t === "active" ? "Ativas" : "Canceladas"}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex flex-col gap-2.5 px-5">
          {displayed.length === 0 ? (
            <div className="py-8 text-center text-[14px] text-text-muted">
              Nenhuma assinatura {tab === "active" ? "ativa" : "cancelada"}
            </div>
          ) : (
            displayed.map((sub) => (
              <div
                key={sub.id}
                className="rounded-[15px] border border-border bg-surface px-4 py-3.5 shadow-card"
              >
                <div className="mb-1 flex items-center gap-3">
                  <Badge label={sub.name} color={subColor(sub.name)} size="md" />
                  <div className="flex-1">
                    <div className="text-[14px] font-semibold text-text-primary">
                      {sub.name}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      {sub.cycle === "monthly" ? "Mensal" : "Anual"} · dia {sub.day}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="font-mono text-[14px] font-semibold text-text-primary">
                      {formatBRL(sub.amountCents)}
                    </div>
                    {sub.status === "cancelled" && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ color: "#98A29A", background: "#98A29A1A" }}
                      >
                        Cancelada
                      </span>
                    )}
                    {sub.status === "active" && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ color: "#0E8C5A", background: "#0E8C5A1A" }}
                      >
                        Ativa
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <NewSubscriptionSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onAdd={addSubscription}
      />
    </div>
  );
}
