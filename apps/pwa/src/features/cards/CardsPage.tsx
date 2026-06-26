"use client";

import { useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { StaleBanner } from "@/components/StaleBanner";
import { useAppState } from "@/lib/state/app-state-context";

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatInputBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "0,00";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10).toLocaleString("pt-BR")},${decPart}`;
}

function parseBRLToCents(value: string): number {
  const cleaned = value.replace(/[.\s]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

interface CardData {
  id: string;
  name: string;
  color: string;
  creditLimitCents: number;
  closingDay: number;
  dueDay: number;
  spentCents: number;
  pct: number;
  purchases: {
    id: string;
    description: string;
    amountCents: number;
    date: string;
    categoryName: string;
  }[];
}

const BANK_GRADIENTS: Record<string, string> = {
  "#820AD1": "linear-gradient(145deg, #820AD1, #4A0080)",
  "#4A0080": "linear-gradient(145deg, #820AD1, #4A0080)",
  "#EC7000": "linear-gradient(145deg, #EC7000, #C45A00)",
  "#C45A00": "linear-gradient(145deg, #EC7000, #C45A00)",
  "#CC092F": "linear-gradient(145deg, #CC092F, #A0001F)",
  "#EC0000": "linear-gradient(145deg, #EC0000, #B80000)",
  "#003882": "linear-gradient(145deg, #003882, #002060)",
  "#005CA9": "linear-gradient(145deg, #005CA9, #003D73)",
  "#FF7A00": "linear-gradient(145deg, #FF7A00, #D46400)",
  "#1A1A1A": "linear-gradient(145deg, #1A1A1A, #000000)",
  "#009A3E": "linear-gradient(145deg, #009A3E, #006B2B)",
  "#C9A84C": "linear-gradient(145deg, #C9A84C, #9A7A2F)",
  "#00C1D4": "linear-gradient(145deg, #00C1D4, #009BAB)",
  "#21C25E": "linear-gradient(145deg, #21C25E, #148040)",
};

function gradientFor(color: string | undefined): string {
  if (!color) return "linear-gradient(145deg, #4A5568, #2D3748)";
  return BANK_GRADIENTS[color] ?? `linear-gradient(145deg, ${color}, ${color}dd)`;
}

const CARD_BRANDS = [
  { name: "Nubank", color: "#820AD1" },
  { name: "Itaú", color: "#EC7000" },
  { name: "Bradesco", color: "#CC092F" },
  { name: "Caixa", color: "#005CA9" },
  { name: "Santander", color: "#EC0000" },
  { name: "Banco Inter", color: "#FF7A00" },
  { name: "C6", color: "#1A1A1A" },
  { name: "BTG", color: "#003882" },
  { name: "Will Bank", color: "#00C1D4" },
  { name: "BMG", color: "#009A3E" },
  { name: "Outro", color: "#4A5568" },
];

// ── NewCardSheet ───────────────────────────────────────────────────────────

function NewCardSheet({
  open,
  onClose,
  onAddCard,
}: {
  open: boolean;
  onClose: () => void;
  onAddCard: (input: {
    name: string;
    creditLimitCents: number;
    closingDay: number;
    dueDay: number;
  }) => void;
}) {
  const [brand, setBrand] = useState("Nubank");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("1");
  const [dueDay, setDueDay] = useState("10");

  function handleSave() {
    const displayName = name.trim() || brand;
    onAddCard({
      name: displayName,
      creditLimitCents: parseBRLToCents(limit),
      closingDay: parseInt(closingDay, 10) || 15,
      dueDay: parseInt(dueDay, 10) || 25,
    });
    setName("");
    setLimit("");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Novo cartão">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Bandeira / banco
          </label>
          <div className="flex flex-wrap gap-2">
            {CARD_BRANDS.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => setBrand(b.name)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  brand === b.name ? "bg-primary text-white" : "bg-fill-light text-text-secondary"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Apelido do cartão</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Nubank, Itaú..."
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary"
          />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Limite</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={limit}
              onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setLimit(formatInputBRL(raw)); }}
              placeholder="0,00"
              className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none focus:border-primary"
            />
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-2.5">
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Dia de fechamento</label>
            <input type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)}
              className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
          </fieldset>
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Dia de vencimento</label>
            <input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)}
              className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
          </fieldset>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-label="Salvar cartão"
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Salvar cartão
        </button>
      </div>
    </BottomSheet>
  );
}

// ── PayStatementSheet ──────────────────────────────────────────────────────

function PayStatementSheet({
  open,
  onClose,
  card,
  accounts,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  card: CardData | null;
  accounts: { id: string; name: string; kind: string }[];
  onPay: (input: { amountCents: number; fromAccountId: string }) => void;
}) {
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partialDisplay, setPartialDisplay] = useState("");
  const [accountId, setAccountId] = useState("");

  if (!card) return null;

  const fullAmountCents = card.spentCents;
  const partialCents = parseBRLToCents(partialDisplay);
  const amountCents = mode === "full" ? fullAmountCents : partialCents;
  const remainingAfterPay = Math.max(0, fullAmountCents - amountCents);
  const checkingAccounts = accounts.filter((a) => a.kind !== "credit_card");

  function handlePay() {
    if (amountCents <= 0 || !accountId) return;
    onPay({ amountCents, fromAccountId: accountId });
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Pagar fatura">
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-[14px] bg-fill-light px-3.5 py-3">
          <div className="flex h-[44px] w-[70px] flex-none items-center justify-center rounded-[10px] font-mono text-[10px] font-bold text-white"
            style={{ background: gradientFor(card.color) }}>
            {card.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="text-[14px] font-bold text-text-primary">{card.name}</div>
            <div className="text-[11px] text-text-muted">Vence dia {card.dueDay}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-text-muted">Total</div>
            <div className="font-mono text-[15px] font-bold text-text-primary">{formatBRL(fullAmountCents)}</div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Tipo de pagamento</label>
          <div className="flex gap-1 rounded-xl bg-fill-light p-1">
            <button type="button" onClick={() => setMode("full")}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${mode === "full" ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"}`}>
              Total
            </button>
            <button type="button" onClick={() => setMode("partial")}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${mode === "partial" ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"}`}>
              Parcial
            </button>
          </div>
        </div>

        {mode === "partial" ? (
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Valor a pagar</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[18px] font-semibold text-text-secondary">R$</span>
              <input type="text" inputMode="numeric" value={partialDisplay}
                onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setPartialDisplay(formatInputBRL(raw)); }}
                placeholder="0,00"
                className="w-full rounded-[13px] border border-border bg-transparent py-3.5 pl-11 pr-3.5 font-mono text-[18px] font-semibold text-text-primary outline-none focus:border-primary" />
            </div>
            {partialCents > 0 && partialCents < fullAmountCents && (
              <div className="mt-1.5 text-[11px] text-text-muted">
                Restante após pagar: <span className="font-mono font-bold text-danger">{formatBRL(remainingAfterPay)}</span>
              </div>
            )}
          </fieldset>
        ) : (
          <div className="rounded-[13px] bg-primary-tint px-4 py-3.5 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-primary">Valor a pagar</div>
            <div className="font-mono text-[28px] font-extrabold text-primary">{formatBRL(fullAmountCents)}</div>
            <div className="text-[10px] text-primary">Fatura integral</div>
          </div>
        )}

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Pagar com a conta</label>
          {checkingAccounts.length === 0 ? (
            <div className="rounded-[12px] bg-fill-light px-3 py-3 text-center text-[12px] text-text-muted">Nenhuma conta disponível.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {checkingAccounts.map((acc) => (
                <button key={acc.id} type="button" onClick={() => setAccountId(acc.id === accountId ? "" : acc.id)}
                  className={`rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${accountId === acc.id ? "bg-primary text-white" : "bg-fill-light text-text-secondary"}`}>
                  {acc.name}
                </button>
              ))}
            </div>
          )}
        </fieldset>

        <button
          type="button"
          onClick={handlePay}
          disabled={amountCents <= 0 || !accountId}
          className="w-full rounded-[14px] bg-primary py-4 text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {mode === "full" ? "Pagar fatura total" : "Pagar valor parcial"}
        </button>
      </div>
    </BottomSheet>
  );
}

// ── EditSheet ──────────────────────────────────────────────────────────────

function EditSheet({
  open,
  onClose,
  card,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  card: CardData | null;
  onUpdate: (id: string, input: { name?: string; creditLimitCents?: number; closingDay?: number; dueDay?: number }) => void;
}) {
  const [name, setName] = useState(card?.name ?? "");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? "15"));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? "25"));

  if (!card) return null;

  function handleSave() {
    onUpdate(card!.id, {
      name: name.trim() || card!.name,
      creditLimitCents: parseBRLToCents(limit) || card!.creditLimitCents,
      closingDay: parseInt(closingDay, 10) || card!.closingDay,
      dueDay: parseInt(dueDay, 10) || card!.dueDay,
    });
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar cartão">
      <div className="flex flex-col gap-4">
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Apelido</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Limite</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-semibold text-text-secondary">R$</span>
            <input type="text" inputMode="numeric" value={limit}
              onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setLimit(formatInputBRL(raw)); }}
              placeholder={card.creditLimitCents > 0 ? formatBRL(card.creditLimitCents).replace("R$\u00A0", "") : "0,00"}
              className="w-full rounded-[13px] border border-border bg-transparent py-3 pl-11 pr-3.5 font-mono text-[16px] font-semibold text-text-primary outline-none focus:border-primary" />
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-2.5">
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Fechamento</label>
            <input type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)}
              className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
          </fieldset>
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Vencimento</label>
            <input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)}
              className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
          </fieldset>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-label="Salvar edição do cartão"
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
        >
          Salvar alterações
        </button>
      </div>
    </BottomSheet>
  );
}

// ── CardsPage ──────────────────────────────────────────────────────────────

export default function CardsPage() {
  const { accounts, transactions, categories, cardStatements, loading, error,
    addCard, payStatement, updateCard } = useAppState();
  const [payCard, setPayCard] = useState<CardData | null>(null);
  const [editCard, setEditCard] = useState<CardData | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

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

  const creditCards = accounts.filter((a) => a.kind === "credit_card");

  const cardsData: CardData[] = creditCards.map((card) => {
    const purchases = transactions
      .filter((t) => t.accountId === card.id && t.kind === "expense")
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({
        id: p.id,
        description: p.description,
        amountCents: p.amountCents,
        date: p.date,
        categoryName: categories.find((c) => c.id === p.categoryId)?.name ?? "",
      }));

    const spentCents = purchases.reduce((s, p) => s + p.amountCents, 0);
    const limit = card.creditLimitCents ?? 1;
    const pct = Math.min((spentCents / limit) * 100, 100);
    return { id: card.id, name: card.name, color: card.color ?? "#4A5568",
      creditLimitCents: limit, closingDay: card.closingDay ?? 1, dueDay: card.dueDay ?? 1,
      spentCents, pct, purchases };
  });

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader
          title="Cartões"
          action={
            <button type="button" onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-[15px] py-[9px] text-[12px] font-bold text-white">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Novo
            </button>
          }
        />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">⚠ {error}</div>
        )}

        <StaleBanner domains={["accounts", "cardStatements", "transactions"]} />

        {!selectedCardId ? (
          <div className="flex flex-col gap-5 px-5">
            {cardsData.length === 0 && (
              <div className="py-[50px] text-center text-text-muted">
                <div className="text-[14px] font-semibold">Nenhum cartão</div>
                <div className="mt-1 text-[12px]">Adicione um cartão para começar.</div>
              </div>
            )}
            {cardsData.map((card) => {
              const bgGrad = gradientFor(card.color);
              const availCents = card.creditLimitCents - card.spentCents;
              return (
                <div key={card.id} onClick={() => setSelectedCardId(card.id)} className="cursor-pointer">
                  <div className="overflow-hidden rounded-[18px] p-5 text-white shadow-card" style={{ background: bgGrad, minHeight: 160 }}>
                    <div className="mb-[22px] flex items-start justify-between">
                      <div>
                        <div className="text-[14px] font-bold">{card.name}</div>
                        <div className="text-[11px] text-white/70">Fecha dia {card.closingDay} · vence dia {card.dueDay}</div>
                      </div>
                      <svg width="30" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" />
                      </svg>
                    </div>
                    <div className="mb-[3px] text-[11px] text-white/70">Fatura atual</div>
                    <div className="mb-3 font-mono text-[24px] font-semibold leading-none">{formatBRL(card.spentCents)}</div>
                    <div className="mb-[7px] h-[6px] rounded-[4px] bg-white/22">
                      <div className="h-full rounded-[4px] bg-white" style={{ width: `${card.pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-white/80">
                      <span>{formatPct(card.pct)} de {formatBRL(card.creditLimitCents)}</span>
                      <span>{formatBRL(availCents)} livre</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          (() => {
            const card = cardsData.find((c) => c.id === selectedCardId);
            if (!card) return null;
            const bgGrad = gradientFor(card.color);
            const availCents = card.creditLimitCents - card.spentCents;

            // Statements for this card from context
            const cardStmts = cardStatements.filter((s) => s.accountId === card.id)
              .sort((a, b) => b.cycleYearMonth.localeCompare(a.cycleYearMonth));

            return (
              <div className="flex flex-col gap-4 px-5">
                <div className="flex items-center justify-between">
                  <button onClick={() => setSelectedCardId(null)} className="flex items-center gap-1.5 text-[14px] font-semibold text-primary">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                    Cartões
                  </button>
                  <button
                    onClick={() => setEditCard(card)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-[7px] text-[12px] font-semibold text-text-secondary"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    Editar
                  </button>
                </div>

                {/* Hero KPIs */}
                <div className="rounded-[18px] p-[18px] text-white" style={{ background: bgGrad }}>
                  <div className="mb-3.5 text-[14px] font-bold">{card.name}</div>
                  <div className="flex justify-between">
                    <div>
                      <div className="text-[11px] text-white/70">Fatura</div>
                      <div className="font-mono text-[18px] font-semibold">{formatBRL(card.spentCents)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/70">Vence dia</div>
                      <div className="font-mono text-[18px] font-semibold">{card.dueDay}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-white/70">Limite livre</div>
                      <div className="font-mono text-[18px] font-semibold">{formatBRL(availCents)}</div>
                    </div>
                  </div>
                </div>

                {/* Pagar fatura */}
                <button
                  type="button"
                  onClick={() => setPayCard(card)}
                  disabled={card.spentCents === 0}
                  className="w-full rounded-[13px] bg-primary py-[13px] text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  Pagar fatura
                </button>

                {/* Compras da fatura */}
                <div>
                  <div className="mb-2 text-[13px] font-bold text-text-primary">Compras da fatura</div>
                  <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
                    {card.purchases.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[12px] text-text-muted">Nenhuma compra nesta fatura.</div>
                    ) : (
                      card.purchases.map((p) => (
                        <div key={p.id} className="flex items-center justify-between border-b border-fill-medium px-4 py-3 last:border-none">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-semibold text-text-primary">{p.description}</span>
                              {p.categoryName && (
                                <span className="rounded-[5px] bg-primary-tint px-1.5 py-0.5 text-[9px] font-bold text-primary">{p.categoryName}</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-text-muted">{new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
                          </div>
                          <div className="ml-3 flex-none font-mono text-[13px] font-semibold text-danger">{formatBRL(p.amountCents)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Histórico de faturas */}
                <div>
                  <div className="mb-2 mt-2 text-[13px] font-bold text-text-primary">Histórico</div>
                  <div className="overflow-hidden rounded-[16px] border border-border bg-surface">
                    {cardStmts.length > 0 ? (
                      cardStmts.map((s) => {
                        const monthLabel = new Date(s.closingDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                        const isPaid = s.status === "paid";
                        const isOverdue = s.status === "overdue";
                        const statusLabel = isPaid ? "Paga" : isOverdue ? "Atrasada" : s.status === "open" ? "Aberta" : s.status === "partial" ? "Parcial" : "Fechada";
                        const statusColor = isPaid ? "#0E8C5A" : isOverdue ? "#C8483B" : "#5C665E";
                        const statusTint = isPaid ? "#E7F3EC" : isOverdue ? "#F7E9E7" : "#F4F5F2";
                        return (
                          <div key={s.id} className="flex items-center justify-between border-b border-fill-medium px-4 py-3.5 last:border-none">
                            <div>
                              <div className="text-[13px] font-semibold capitalize text-text-primary">{monthLabel}</div>
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: statusTint, color: statusColor }}>{statusLabel}</span>
                            </div>
                            <span className="font-mono text-[14px] font-semibold text-danger">{formatBRL(s.totalCents)}</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-6 text-center text-[12px] text-text-muted">
                        Nenhuma fatura anterior registrada.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()
        )}
      </main>

      <NewCardSheet open={createOpen} onClose={() => setCreateOpen(false)} onAddCard={addCard} />

      <PayStatementSheet
        open={payCard !== null}
        onClose={() => setPayCard(null)}
        card={payCard}
        accounts={accounts}
        onPay={(input) => {
          const stmtId = cardStatements.find((s) => s.accountId === payCard?.id)?.id ?? "";
          if (stmtId) payStatement(stmtId, input);
        }}
      />

      <EditSheet open={editCard !== null} onClose={() => setEditCard(null)} card={editCard} onUpdate={updateCard} />
    </div>
  );
}
