"use client";

import { useState, useEffect, useCallback } from "react";
import { useFormDirtySafe } from "@/lib/unsaved-changes";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { StaleBanner } from "@/components/StaleBanner";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
import { fetchStatementDetail, updateCardPurchase } from "@/lib/api/endpoints";
import type { StatementDetail, StatementPurchase } from "@/lib/state/types";
import { useAppState } from "@/lib/state/app-state-context";
import { Plus, ChevronLeft, CreditCard as CreditCardIcon, Edit3 } from "lucide-react";

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

interface CardPurchase {
  id: string;
  description: string;
  amountCents: number;
  date: string;
  categoryName: string;
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
  purchases: CardPurchase[];
  currentStmtId?: string;
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
  }) => void | Promise<void>;
}) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [brand, setBrand] = useState("Nubank");
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState("1");
  const [dueDay, setDueDay] = useState("10");

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBrand("Nubank");
      setName("");
      setLimit("");
      markClean();
    }
  }, [open, markClean]);

  async function handleSave() {
    const displayName = name.trim() || brand;
    try {
      await onAddCard({
        name: displayName,
        creditLimitCents: parseBRLToCents(limit),
        closingDay: parseInt(closingDay, 10) || 15,
        dueDay: parseInt(dueDay, 10) || 25,
      });
      markClean();
      onClose();
    } catch {
      // Keep dirty
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Novo cartão">
      <div className="flex flex-col gap-4" onChangeCapture={markDirty}>
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Bandeira / banco
          </label>
          <div className="flex flex-wrap gap-2">
            {CARD_BRANDS.map((b) => (
              <button
                key={b.name}
                type="button"
                onClick={() => { markDirty(); setBrand(b.name); }}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${
                  brand === b.name
                    ? "bg-primary text-white shadow-xs"
                    : "bg-surface-2 text-text-secondary hover:bg-surface-3"
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full shadow-xs" style={{ background: b.color }} />
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Apelido do cartão</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Nubank, Itaú..."
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary"
          />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Limite</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-bold text-text-muted">R$</span>
            <input
              type="text"
              inputMode="numeric"
              value={limit}
              onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setLimit(formatInputBRL(raw)); }}
              placeholder="0,00"
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-11 pr-3.5 font-mono tabular-nums text-[16px] font-bold text-text-primary outline-none focus:border-primary"
            />
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-2.5">
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Dia de fechamento</label>
            <input type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)}
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
          </fieldset>
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Dia de vencimento</label>
            <input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)}
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
          </fieldset>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-label="Salvar cartão"
          className="mt-2 w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98]"
        >
          Salvar cartão
        </button>
      </div>
    </BottomSheet>
  );
}

function PayStatementSheet({
  open,
  onClose,
  card,
  accounts,
  onPay,
  error,
}: {
  open: boolean;
  onClose: () => void;
  card: CardData | null;
  accounts: { id: string; name: string; kind: string }[];
  onPay: (input: { amountCents: number; fromAccountId: string }) => void | Promise<void>;
  error?: string | null;
}) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [mode, setMode] = useState<"full" | "partial">("full");
  const [partialDisplay, setPartialDisplay] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode("full");
      setPartialDisplay("");
      setAccountId("");
      markClean();
    }
  }, [open, markClean]);

  if (!card) return null;

  const fullAmountCents = card.spentCents;
  const partialCents = parseBRLToCents(partialDisplay);
  const amountCents = mode === "full" ? fullAmountCents : partialCents;
  const remainingAfterPay = Math.max(0, fullAmountCents - amountCents);
  const checkingAccounts = accounts.filter((a) => a.kind !== "credit_card");

  async function handlePay() {
    if (amountCents <= 0 || !accountId) return;
    try {
      await onPay({ amountCents, fromAccountId: accountId });
      markClean();
      onClose();
    } catch {
      // Keep dirty
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Pagar fatura">
      <div className="flex flex-col gap-5" onChangeCapture={markDirty}>
        {error && (
          <div
            data-testid="pay-error"
            role="alert"
            className="rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger"
          >
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}
        <div className="flex items-center gap-3 rounded-[16px] border border-border-subtle bg-surface-2 px-3.5 py-3">
          <div className="flex h-[44px] w-[70px] flex-none items-center justify-center rounded-[10px] font-mono text-[11px] font-bold text-white shadow-xs"
            style={{ background: gradientFor(card.color) }}>
            {card.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="truncate text-[14px] font-bold text-text-primary">{card.name}</div>
            <div className="text-[11px] font-medium text-text-muted">Vence dia {card.dueDay}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Total</div>
            <div className="font-mono tabular-nums text-[15px] font-bold text-text-primary">{formatBRL(fullAmountCents)}</div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Tipo de pagamento</label>
          <div className="flex gap-1 rounded-[14px] bg-surface-2 p-1 border border-border-subtle">
            <button type="button" onClick={() => { markDirty(); setMode("full"); }}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-all ${mode === "full" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted"}`}>
              Total
            </button>
            <button type="button" onClick={() => { markDirty(); setMode("partial"); }}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-all ${mode === "partial" ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted"}`}>
              Parcial
            </button>
          </div>
        </div>

        {mode === "partial" ? (
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Valor a pagar</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[18px] font-bold text-text-muted">R$</span>
              <input type="text" inputMode="numeric" value={partialDisplay}
                onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setPartialDisplay(formatInputBRL(raw)); }}
                placeholder="0,00"
                className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3.5 pl-11 pr-3.5 font-mono tabular-nums text-[18px] font-bold text-text-primary outline-none focus:border-primary" />
            </div>
            {partialCents > 0 && partialCents < fullAmountCents && (
              <div className="mt-1.5 text-[11px] font-medium text-text-muted">
                Restante após pagar: <span className="font-mono tabular-nums font-bold text-danger">{formatBRL(remainingAfterPay)}</span>
              </div>
            )}
          </fieldset>
        ) : (
          <div className="rounded-[16px] border border-primary/20 bg-primary-tint px-4 py-3.5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Valor a pagar</div>
            <div className="font-mono tabular-nums text-[28px] font-bold text-primary">{formatBRL(fullAmountCents)}</div>
            <div className="text-[10px] font-semibold text-primary">Fatura integral</div>
          </div>
        )}

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Pagar com a conta</label>
          {checkingAccounts.length === 0 ? (
            <div className="rounded-[14px] border border-border-subtle bg-surface-2 px-3 py-3 text-center text-[12px] text-text-muted">Nenhuma conta disponível.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {checkingAccounts.map((acc) => (
                <button key={acc.id} type="button" onClick={() => { markDirty(); setAccountId(acc.id === accountId ? "" : acc.id); }}
                  className={`rounded-full px-3.5 py-2 text-[12px] font-bold transition-all ${accountId === acc.id ? "bg-primary text-white shadow-xs" : "bg-surface-2 text-text-secondary hover:bg-surface-3"}`}>
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
          className="w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
        >
          {mode === "full" ? "Pagar fatura total" : "Pagar valor parcial"}
        </button>
      </div>
    </BottomSheet>
  );
}

function EditSheet({
  open,
  onClose,
  card,
  onUpdate,
}: {
  open: boolean;
  onClose: () => void;
  card: CardData | null;
  onUpdate: (id: string, input: { name?: string; creditLimitCents?: number; closingDay?: number; dueDay?: number }) => void | Promise<void>;
}) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [name, setName] = useState(card?.name ?? "");
  const [limit, setLimit] = useState("");
  const [closingDay, setClosingDay] = useState(String(card?.closingDay ?? "15"));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? "25"));

  useEffect(() => {
    if (card && open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(card.name);
      setLimit("");
      setClosingDay(String(card.closingDay));
      setDueDay(String(card.dueDay));
      markClean();
    }
  }, [card, open, markClean]);

  if (!card) return null;

  async function handleSave() {
    try {
      await onUpdate(card!.id, {
        name: name.trim() || card!.name,
        creditLimitCents: parseBRLToCents(limit) || card!.creditLimitCents,
        closingDay: parseInt(closingDay, 10) || card!.closingDay,
        dueDay: parseInt(dueDay, 10) || card!.dueDay,
      });
      markClean();
      onClose();
    } catch {
      // Keep dirty
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar cartão">
      <div className="flex flex-col gap-4" onChangeCapture={markDirty}>
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Apelido</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Limite</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-bold text-text-muted">R$</span>
            <input type="text" inputMode="numeric" value={limit}
              onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setLimit(formatInputBRL(raw)); }}
              placeholder={card.creditLimitCents > 0 ? formatBRL(card.creditLimitCents).replace("R$\u00A0", "") : "0,00"}
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-11 pr-3.5 font-mono tabular-nums text-[16px] font-bold text-text-primary outline-none focus:border-primary" />
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-2.5">
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Fechamento</label>
            <input type="number" min={1} max={31} value={closingDay} onChange={(e) => setClosingDay(e.target.value)}
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
          </fieldset>
          <fieldset>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Vencimento</label>
            <input type="number" min={1} max={31} value={dueDay} onChange={(e) => setDueDay(e.target.value)}
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
          </fieldset>
        </div>

        <button
          type="button"
          onClick={handleSave}
          aria-label="Salvar edição do cartão"
          className="mt-2 w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98]"
        >
          Salvar alterações
        </button>
      </div>
    </BottomSheet>
  );
}

function PurchaseEditSheet({
  purchase,
  categories,
  open,
  onClose,
  onSave,
}: {
  purchase: StatementPurchase | null;
  categories: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  onSave: (input: { description: string; amountCents: number; date: string; categoryId?: string }) => void | Promise<void>;
}) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [description, setDescription] = useState("");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [date, setDate] = useState("");
  const [categoryId, setCategoryId] = useState("");

  useEffect(() => {
    if (purchase && open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDescription(purchase.description);
      setAmountDisplay(formatInputBRL(String(purchase.amountCents)));
      setDate(purchase.date);
      setCategoryId(purchase.categoryId ?? "");
      markClean();
    }
  }, [purchase, open, markClean]);

  if (!purchase) return null;

  function handleClose() {
    markClean();
    onClose();
  }

  async function handleSave() {
    try {
      await onSave({
        description: description.trim(),
        amountCents: parseBRLToCents(amountDisplay),
        date,
        categoryId: categoryId || undefined,
      });
      markClean();
      onClose();
    } catch {
      // Keep dirty
    }
  }

  return (
    <BottomSheet open={open} onClose={handleClose} title="Editar compra">
      <div className="flex flex-col gap-4" onChangeCapture={markDirty}>
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Descrição</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Valor</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[16px] font-bold text-text-muted">R$</span>
            <input type="text" inputMode="numeric" value={amountDisplay}
              onChange={(e) => { const raw = e.target.value.replace(/\D/g, ""); if (raw.length > 12) return; setAmountDisplay(formatInputBRL(raw)); }}
              className="w-full rounded-[14px] border border-border-subtle bg-surface-2 py-3 pl-11 pr-3.5 font-mono tabular-nums text-[16px] font-bold text-text-primary outline-none focus:border-primary" />
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Data</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Categoria</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary">
            <option value="">Sem categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </fieldset>

        <button type="button" onClick={handleSave}
          disabled={!description.trim() || !date}
          className="mt-2 w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50">
          Salvar alterações
        </button>
      </div>
    </BottomSheet>
  );
}

export default function CardsPage() {
  const { accounts, transactions, categories, cardStatements, loading, error,
    addCard, payStatement, updateCard, writeError, clearWriteError } = useAppState();
  const [payCard, setPayCard] = useState<CardData | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [editCard, setEditCard] = useState<CardData | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
  const [stmtDetail, setStmtDetail] = useState<StatementDetail | null>(null);
  const [editPurchase, setEditPurchase] = useState<StatementPurchase | null>(null);
  const [stmtRefreshKey, setStmtRefreshKey] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("cardId");
    if (id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedCardId(id);
    }
  }, []);

  useEffect(() => {
    if (!selectedCardId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedStatementId(null);
      return;
    }

    const latestStmt = cardStatements
      .filter((s) => s.accountId === selectedCardId)
      .sort((a, b) => b.cycleYearMonth.localeCompare(a.cycleYearMonth))[0];

    setSelectedStatementId((current) => {
      if (current && cardStatements.some((s) => s.id === current && s.accountId === selectedCardId)) {
        return current;
      }
      return latestStmt?.id ?? null;
    });
  }, [selectedCardId, cardStatements]);

  useEffect(() => {
    if (!selectedStatementId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStmtDetail(null);
      return;
    }

    let cancelled = false;
    fetchStatementDetail(selectedStatementId)
      .then((detail) => { if (!cancelled) setStmtDetail(detail); })
      .catch(() => { if (!cancelled) setStmtDetail(null); });
    return () => { cancelled = true; };
  }, [selectedStatementId, stmtRefreshKey]);

  const handlePurchaseSave = useCallback(async (input: {
    description: string; amountCents: number; date: string; categoryId?: string;
  }) => {
    if (!editPurchase) return;
    try {
      await updateCardPurchase(editPurchase.id, input);
      setStmtRefreshKey((k) => k + 1);
    } catch {
      // handled
    }
  }, [editPurchase]);

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

  const creditCards = accounts.filter((a) => a.kind === "credit_card");

  const cardsData: CardData[] = creditCards.map((card) => {
    const txPurchases = transactions
      .filter((t) => t.accountId === card.id && t.kind === "expense")
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((p) => ({
        id: p.id,
        description: p.description,
        amountCents: p.amountCents,
        date: p.date,
        categoryName: categories.find((c) => c.id === p.categoryId)?.name ?? "",
      }));

    const stmts = cardStatements
      .filter((s) => s.accountId === card.id)
      .sort((a, b) => b.cycleYearMonth.localeCompare(a.cycleYearMonth));
    const currentStmt = stmts[0];

    const spentCents = currentStmt?.totalCents ?? txPurchases.reduce((s, p) => s + p.amountCents, 0);
    const limit = card.creditLimitCents ?? 1;
    const pct = Math.min((spentCents / limit) * 100, 100);
    return {
      id: card.id, name: card.name, color: card.color ?? "#4A5568",
      creditLimitCents: limit, closingDay: card.closingDay ?? 1, dueDay: card.dueDay ?? 1,
      spentCents, pct, purchases: txPurchases,
      currentStmtId: currentStmt?.id,
    };
  });

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader
          title="Cartões"
          action={
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-primary-hover active:scale-95 transition-all"
            >
              <Plus size={15} strokeWidth={2.4} />
              Novo
            </button>
          }
        />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">⚠ {error}</div>
        )}

        <WriteErrorBanner message={writeError} onDismiss={clearWriteError} />

        <StaleBanner domains={["accounts", "cardStatements", "transactions"]} />

        {!selectedCardId ? (
          <div className="flex flex-col gap-5 px-5 sm:px-8 lg:px-12">
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
                  <div className="overflow-hidden rounded-[22px] p-5 text-white shadow-elevated transition-transform duration-200 hover:scale-[1.01]" style={{ background: bgGrad, minHeight: 160 }}>
                    <div className="mb-[22px] flex items-start justify-between">
                      <div>
                        <div className="text-[15px] font-bold tracking-tight">{card.name}</div>
                        <div className="text-[11px] font-medium text-white/70">Fecha dia {card.closingDay} · vence dia {card.dueDay}</div>
                      </div>
                      <CreditCardIcon size={26} className="text-white/85" />
                    </div>
                    <div className="mb-[3px] text-[11px] font-medium text-white/70">Fatura atual</div>
                    <div className="mb-3 font-mono tabular-nums text-[26px] font-bold leading-none">{formatBRL(card.spentCents)}</div>
                    <div className="mb-[7px] h-[6px] rounded-full bg-white/20 overflow-hidden">
                      <div className="h-full rounded-full bg-white transition-all duration-300" style={{ width: `${card.pct}%` }} />
                    </div>
                    <div className="flex justify-between font-mono tabular-nums text-[11px] font-semibold text-white/80">
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

            const cardStmts = cardStatements.filter((s) => s.accountId === card.id)
              .sort((a, b) => b.cycleYearMonth.localeCompare(a.cycleYearMonth));
            const selectedStmtSummary = cardStmts.find((s) => s.id === selectedStatementId) ?? cardStmts[0];
            const detailSpent = stmtDetail?.id === selectedStatementId
              ? stmtDetail.totalCents
              : selectedStmtSummary?.totalCents ?? card.spentCents;
            const detailPurchases = stmtDetail?.id === selectedStatementId
              ? stmtDetail.purchases
              : selectedStmtSummary?.id === card.currentStmtId
                ? card.purchases
                : [];
            const detailDueDay = selectedStmtSummary
              ? new Date(`${selectedStmtSummary.dueDate}T12:00:00`).getDate()
              : card.dueDay;
            const bgGrad = gradientFor(card.color);
            const availCents = card.creditLimitCents - detailSpent;

            return (
              <div className="flex flex-col gap-4 px-5 sm:px-8 lg:px-12">
                <div className="flex items-center justify-between">
                  <button onClick={() => { setSelectedCardId(null); setSelectedStatementId(null); }} className="flex items-center gap-1.5 text-[14px] font-bold text-primary hover:underline">
                    <ChevronLeft size={18} strokeWidth={2.4} />
                    Cartões
                  </button>
                  <button
                    onClick={() => setEditCard(card)}
                    className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-1 px-3.5 py-1.5 text-[12px] font-bold text-text-secondary hover:bg-surface-2 transition-colors"
                  >
                    <Edit3 size={14} />
                    Editar
                  </button>
                </div>

                {/* Hero KPIs */}
                <div className="rounded-[22px] p-5 text-white shadow-elevated" style={{ background: bgGrad }}>
                  <div className="mb-3.5 text-[15px] font-bold tracking-tight">{card.name}</div>
                  <div className="flex justify-between">
                    <div>
                      <div className="text-[11px] font-medium text-white/70">Fatura</div>
                      <div className="font-mono tabular-nums text-[18px] font-bold">{formatBRL(detailSpent)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-white/70">Vence dia</div>
                      <div className="font-mono tabular-nums text-[18px] font-bold">{detailDueDay}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-white/70">Limite livre</div>
                      <div className="font-mono tabular-nums text-[18px] font-bold">{formatBRL(availCents)}</div>
                    </div>
                  </div>
                </div>

                {/* Pagar fatura */}
                <button
                  type="button"
                  onClick={() => setPayCard({ ...card, spentCents: detailSpent })}
                  disabled={detailSpent === 0 || selectedStmtSummary?.status === "paid"}
                  className="w-full rounded-[14px] bg-primary py-3.5 text-[14px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50"
                >
                  Pagar fatura
                </button>

                {/* Compras da fatura */}
                <div>
                  <div className="mb-2 text-[13px] font-bold text-text-primary">Compras da fatura</div>
                  <div className="overflow-hidden rounded-[18px] border border-border-subtle bg-surface-1 shadow-card">
                    {detailPurchases.length === 0 ? (
                      <div className="px-4 py-6 text-center text-[12px] text-text-muted">Nenhuma compra nesta fatura.</div>
                    ) : (
                      detailPurchases.map((p) => (
                        <div key={p.id} onClick={() => setEditPurchase(p)} className="flex cursor-pointer items-center justify-between border-b border-border-subtle px-4 py-3.5 last:border-none hover:bg-surface-2/60 active:bg-surface-2 transition-colors">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[13px] font-bold text-text-primary">{p.description}</span>
                              {p.categoryName && (
                                <span className="rounded-full bg-primary-tint px-2 py-0.5 text-[9px] font-bold text-primary">{p.categoryName}</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] font-medium text-text-muted">{new Date(p.date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
                          </div>
                          <div className="ml-3 flex-none font-mono tabular-nums text-[13px] font-bold text-danger">{formatBRL(p.amountCents)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Histórico de faturas */}
                <div>
                  <div className="mb-2 mt-2 text-[13px] font-bold text-text-primary">Histórico</div>
                  <div className="overflow-hidden rounded-[18px] border border-border-subtle bg-surface-1 shadow-card">
                    {cardStmts.length > 0 ? (
                      cardStmts.map((s) => {
                        const monthLabel = new Date(s.closingDate).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                        const isPaid = s.status === "paid";
                        const isOverdue = s.status === "overdue";
                        const statusLabel = isPaid ? "Paga" : isOverdue ? "Atrasada" : s.status === "open" ? "Aberta" : s.status === "partial" ? "Parcial" : "Fechada";
                        const statusColor = isPaid ? "var(--color-primary)" : isOverdue ? "var(--color-danger)" : "var(--color-text-secondary)";
                        const statusTint = isPaid ? "var(--color-primary-tint)" : isOverdue ? "var(--color-danger-tint)" : "var(--surface-2)";
                        const isSelected = s.id === selectedStatementId;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedStatementId(s.id)}
                            className={`flex w-full items-center justify-between border-b border-border-subtle px-4 py-3.5 text-left last:border-none hover:bg-surface-2/60 transition-colors ${isSelected ? "bg-primary-tint/40" : ""}`}
                            aria-pressed={isSelected}
                            aria-label={`${monthLabel} ${statusLabel}`}
                          >
                            <div>
                              <div className="text-[13px] font-bold capitalize text-text-primary">{monthLabel}</div>
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: statusTint, color: statusColor }}>{statusLabel}</span>
                            </div>
                            <span className="font-mono tabular-nums text-[14px] font-bold text-danger">{formatBRL(s.totalCents)}</span>
                          </button>
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
        onClose={() => {
          setPayCard(null);
          setPayError(null);
        }}
        card={payCard}
        accounts={accounts}
        error={payError}
        onPay={async (input) => {
          // No statement selected must never be a silent no-op that closes
          // the sheet: surface a visible, recoverable error instead.
          if (!selectedStatementId) {
            setPayError("Nenhuma fatura selecionada para pagamento.");
            return;
          }
          try {
            setPayError(null);
            await payStatement(selectedStatementId, input);
          } catch (e) {
            setPayError(e instanceof Error ? e.message : "Falha ao pagar a fatura.");
            throw e;
          }
        }}
      />

      <EditSheet open={editCard !== null} onClose={() => setEditCard(null)} card={editCard} onUpdate={updateCard} />

      <PurchaseEditSheet
        purchase={editPurchase}
        categories={categories}
        open={editPurchase !== null}
        onClose={() => setEditPurchase(null)}
        onSave={handlePurchaseSave}
      />
    </div>
  );
}
