"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { useFormDirtySafe } from "@/lib/unsaved-changes";
import type { Account, Category } from "@/lib/state/types";

export type SheetTab = "expense" | "income" | "transfer";

export interface SaveData {
  kind: SheetTab;
  amountCents: number;
  description: string;
  date: string;
  categoryId?: string;
  accountId?: string;
  fromAccountId?: string;
  toAccountId?: string;
  installmentsTotal?: number;
}

interface NewTransactionSheetProps {
  accounts: Account[];
  categories: Category[];
  onSave: (data: SaveData) => void | Promise<void>;
  onAddCategory?: (input: { name: string; kind: "expense" | "income"; parentId?: string }) => void;
  onAddAccount?: (input: { name: string; kind: "bank" | "cash" | "credit_card"; initialBalanceCents: number }) => void;
  onAddCard?: (input: { name: string; creditLimitCents: number; closingDay: number; dueDay: number }) => void;
  initialTab?: SheetTab;
}

function formatInputBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "0,00";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10).toLocaleString("pt-BR")},${decPart}`;
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function parseBRLToCents(value: string): number {
  const cleaned = value.replace(/[.\s]/g, "").replace(",", ".");
  return Math.round(parseFloat(cleaned) * 100) || 0;
}

// ── Inline creation form (reusable) ───

function InlineForm({
  onSave: handleInlineSave,
  onCancel,
  fields,
  saveLabel,
}: {
  onSave: () => void;
  onCancel: () => void;
  fields: ReactNode;
  saveLabel: string;
}) {
  return (
    <div className="rounded-[13px] border border-primary/30 bg-primary-tint p-3">
      {fields}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-[10px] border border-border bg-surface py-2.5 text-[12px] font-bold text-text-secondary"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleInlineSave}
          aria-label={saveLabel}
          className="flex-1 rounded-[10px] bg-primary py-2.5 text-[12px] font-bold text-white"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

export default function NewTransactionSheet({
  accounts,
  categories,
  onSave,
  onAddCategory,
  onAddAccount,
  onAddCard,
  initialTab = "expense",
}: NewTransactionSheetProps) {
  const { markDirty, markClean } = useFormDirtySafe();
  const [tab, setTab] = useState<SheetTab>(initialTab);
  const [amountDisplay, setAmountDisplay] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [cardId, setCardId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");

  // Inline creation state
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSubcategory, setAddingSubcategory] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [newName, setNewName] = useState("");
  const [newInitialBalance, setNewInitialBalance] = useState("");
  const [newCreditLimit, setNewCreditLimit] = useState("");
  const [newClosingDay, setNewClosingDay] = useState("15");
  const [newDueDay, setNewDueDay] = useState("25");

  // Parcelamento
  const [installmentsEnabled, setInstallmentsEnabled] = useState(false);
  const [installmentsCount, setInstallmentsCount] = useState(2);

  // Calendar
  const [calOpen, setCalOpen] = useState(false);
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const isTransfer = tab === "transfer";
  const isExpense = tab === "expense";
  const filteredAccounts = accounts.filter((a) => a.kind !== "credit_card");
  const creditCards = accounts.filter((a) => a.kind === "credit_card");

  // Categories: top-level only for picker; subcategories shown separately
  const filteredCategories = categories.filter(
    (c) => c.kind === tab && !c.parentId,
  );

  // Subcategories of the selected category
  const subcategories = categoryId
    ? categories.filter((c) => c.parentId === categoryId)
    : [];

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Calendar helpers
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calFirstDow = new Date(calYear, calMonth, 1).getDay();
  const calFirstShifted = calFirstDow === 0 ? 6 : calFirstDow - 1;
  const calCells: { day: number; isToday: boolean; isSelected: boolean }[] = [];
  for (let i = 0; i < calFirstShifted; i++) calCells.push({ day: 0, isToday: false, isSelected: false });
  for (let d = 1; d <= calDaysInMonth; d++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    calCells.push({ day: d, isToday: iso === today.toISOString().slice(0, 10), isSelected: iso === date });
  }
  const calLabel = new Date(calYear, calMonth).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  function selectCalDay(d: number) {
    setDate(`${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    setCalOpen(false);
  }

  function prevCalMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); } else setCalMonth(calMonth - 1);
  }

  function nextCalMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); } else setCalMonth(calMonth + 1);
  }

  const amountCents = parseBRLToCents(amountDisplay);
  const installmentCents =
    installmentsEnabled && installmentsCount > 0
      ? Math.round(amountCents / installmentsCount)
      : amountCents;

  function handleAmountInput(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    if (raw.length > 12) return;
    setAmountDisplay(formatInputBRL(raw));
  }

  const categoryKind: "expense" | "income" = tab === "income" ? "income" : "expense";

  function handleSaveCategory() {
    if (!newName.trim() || !onAddCategory) return;
    onAddCategory({ name: newName.trim(), kind: categoryKind });
    setNewName("");
    setAddingCategory(false);
  }

  function handleSaveSubcategory() {
    if (!newName.trim() || !onAddCategory || !categoryId) return;
    onAddCategory({ name: newName.trim(), kind: categoryKind, parentId: categoryId });
    setNewName("");
    setAddingSubcategory(false);
  }

  function handleSaveAccount() {
    if (!newName.trim() || !onAddAccount) return;
    const balance = parseInt(newInitialBalance.replace(/\D/g, "") || "0", 10);
    onAddAccount({ name: newName.trim(), kind: "bank", initialBalanceCents: balance });
    setNewName("");
    setNewInitialBalance("");
    setAddingAccount(false);
  }

  function handleSaveCard() {
    if (!newName.trim() || !onAddCard) return;
    const limit = parseInt(newCreditLimit.replace(/\D/g, "") || "0", 10);
    onAddCard({
      name: newName.trim(),
      creditLimitCents: limit,
      closingDay: parseInt(newClosingDay, 10) || 15,
      dueDay: parseInt(newDueDay, 10) || 25,
    });
    setNewName("");
    setNewCreditLimit("");
    setAddingCard(false);
  }

  async function handleSave() {
    if (amountCents <= 0) return;
    let data: SaveData;
    if (isTransfer) {
      // Reject missing or same origin/destination before hitting the API.
      if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return;
      data = {
        kind: "transfer",
        amountCents,
        description,
        date,
        fromAccountId,
        toAccountId,
      };
    } else {
      data = {
        kind: tab,
        amountCents,
        description,
        date,
        categoryId,
        accountId: cardId || accountId,
      };
      if (installmentsEnabled && installmentsCount > 1) {
        data.installmentsTotal = installmentsCount;
      }
    }
    try {
      await onSave(data);
      markClean();
    } catch {
      // Save failed: keep dirty.
    }
  }

  const tabs: { key: SheetTab; label: string }[] = [
    { key: "expense", label: "Despesa" },
    { key: "income", label: "Receita" },
    { key: "transfer", label: "Transferência" },
  ];

  return (
    <div className="flex flex-col gap-5" onChangeCapture={markDirty}>
      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-fill-light p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              // Reset ALL draft fields when switching tabs. Without this,
              // amount/description leak across tabs (e.g. typing a Despesa
              // draft, switching to Transferência by mistake, and the wrong
              // amount/description silently carrying over).
              setTab(t.key);
              setCategoryId("");
              setAccountId("");
              setCardId("");
              setFromAccountId("");
              setToAccountId("");
              setInstallmentsEnabled(false);
              setAmountDisplay("");
              setDescription("");
            }}
            className={`flex-1 rounded-[10px] py-2.5 text-center text-[13px] font-bold transition-colors ${
              tab === t.key
                ? "bg-surface text-text-primary shadow-sm"
                : "text-text-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Valor */}
      <fieldset>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Valor</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[20px] font-semibold text-text-muted">R$</span>
          <input
            type="text"
            inputMode="numeric"
            value={amountDisplay}
            onChange={handleAmountInput}
            placeholder="0,00"
            className="w-full rounded-[13px] border border-border bg-surface py-3 pl-11 pr-3.5 font-mono text-[24px] font-semibold text-text-primary outline-none transition-colors focus:border-primary"
          />
        </div>
      </fieldset>

      {/* Data (custom calendar toggle) */}
      <div>
        <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-text-muted">Data</div>
        <button
          type="button"
          onClick={() => setCalOpen(!calOpen)}
          className="flex w-full items-center justify-between rounded-[13px] bg-surface px-3.5 py-3 text-left transition-colors"
          style={{ border: `1.5px solid ${calOpen ? "var(--color-primary)" : "var(--color-border)"}` }}
        >
          <span className="text-[14px] text-text-primary">{dateLabel}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#98A29A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        </button>
        {calOpen && (
          <div className="mt-1.5 rounded-[13px] border border-border bg-surface p-3">
            <div className="mb-2.5 flex items-center justify-between">
              <button onClick={prevCalMonth} type="button" className="rounded-[7px] px-2.5 py-1 text-[18px] text-text-secondary hover:bg-fill-light">‹</button>
              <span className="text-[13px] font-bold text-text-primary">{calLabel}</span>
              <button onClick={nextCalMonth} type="button" className="rounded-[7px] px-2.5 py-1 text-[18px] text-text-secondary hover:bg-fill-light">›</button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map((d, i) => (
                <span key={d} className={`text-[9px] font-semibold ${i >= 5 ? "text-danger" : "text-text-muted"}`}>{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {calCells.map((c, i) => (
                <button key={i} type="button" disabled={c.day === 0} onClick={() => c.day > 0 && selectCalDay(c.day)}
                  className="min-h-[29px] rounded-[7px] text-center font-mono text-[12px] font-semibold transition-colors"
                  style={{
                    background: c.isSelected ? "var(--color-primary)" : c.isToday ? "var(--color-fill-light)" : "transparent",
                    color: c.isSelected ? "#fff" : c.isToday ? "var(--color-primary)" : "var(--color-text-primary)",
                  }}
                >{c.day > 0 ? c.day : ""}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Descrição */}
      <fieldset>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Descrição</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex: Aluguel, mercado..."
          className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary"
        />
      </fieldset>

      {/* Categoria (only for expense/income) */}
      {!isTransfer && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Categoria</span>
            <button
              type="button"
              onClick={() => { setAddingCategory(true); setAddingSubcategory(false); }}
              className="flex items-center gap-1 text-[11px] font-bold text-primary"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nova
            </button>
          </div>

          {/* Inline new category form */}
          {addingCategory && (
            <div className="mb-2">
              <InlineForm
                onSave={handleSaveCategory}
                onCancel={() => { setAddingCategory(false); setNewName(""); }}
                saveLabel="Salvar categoria"
                fields={
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome da categoria"
                    className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                    autoFocus
                  />
                }
              />
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            {filteredCategories.map((cat) => {
              const selected = categoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id === categoryId ? "" : cat.id)}
                  className={`flex flex-col items-center gap-1 rounded-[12px] p-2 transition-colors ${
                    selected ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-fill-light"
                  }`}
                >
                  <span className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] bg-fill-light">
                    <CategoryBadge name={cat.name} size={16} />
                  </span>
                  <span className={`text-center text-[9.5px] font-semibold leading-tight ${selected ? "text-primary" : "text-text-secondary"}`}>
                    {cat.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Subcategorias (using parentId) */}
      {!isTransfer && (subcategories.length > 0 || (categoryId && onAddCategory)) && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {subcategories.length > 0 ? "Subcategoria" : "Adicionar subcategoria"}
            </span>
            {onAddCategory && categoryId && (
              <button
                type="button"
                onClick={() => { setAddingSubcategory(true); setAddingCategory(false); }}
                className="flex items-center gap-1 text-[11px] font-bold text-primary"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nova subcat.
              </button>
            )}
          </div>

          {/* Inline new subcategory form */}
          {addingSubcategory && (
            <div className="mb-2">
              <InlineForm
                onSave={handleSaveSubcategory}
                onCancel={() => { setAddingSubcategory(false); setNewName(""); }}
                saveLabel="Salvar subcategoria"
                fields={
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Nome da subcategoria"
                    className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                    autoFocus
                  />
                }
              />
            </div>
          )}

          {subcategories.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto">
              {subcategories.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  className="flex items-center gap-1 flex-none rounded-[100px] border border-border-strong bg-fill-light px-3 py-1.5 text-[11px] font-semibold text-text-secondary"
                >
                  <CategoryBadge name={sub.name} size={12} />
                  {sub.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Account picker for expense/income */}
      {!isTransfer && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Conta</span>
            <button
              type="button"
              onClick={() => { setAddingAccount(true); setAddingCard(false); }}
              className="flex items-center gap-1 text-[11px] font-bold text-primary"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nova
            </button>
          </div>

          {/* Inline new account form */}
          {addingAccount && (
            <div className="mb-2">
              <InlineForm
                onSave={handleSaveAccount}
                onCancel={() => { setAddingAccount(false); setNewName(""); setNewInitialBalance(""); }}
                saveLabel="Salvar conta"
                fields={
                  <>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome da conta"
                      className="mb-2 w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                      autoFocus
                    />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={newInitialBalance}
                      onChange={(e) => setNewInitialBalance(e.target.value)}
                      placeholder="Saldo inicial (R$)"
                      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                    />
                  </>
                }
              />
            </div>
          )}

          <div className="flex flex-wrap gap-[7px]">
            {filteredAccounts.map((acc) => {
              const selected = accountId === acc.id;
              const color = acc.color ?? "#4A5568";
              const short = acc.name.slice(0, 2).toUpperCase();
              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setAccountId(acc.id === accountId ? "" : acc.id)}
                  className={`flex items-center gap-2 rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                    selected ? "bg-primary text-white" : "bg-fill-light text-text-secondary"
                  }`}
                >
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] font-mono text-[8px] font-bold" style={{ background: color, color: "#fff" }}>
                    {short}
                  </span>
                  {acc.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cartão (expense only) */}
      {isExpense && creditCards.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Cartão</span>
            <button
              type="button"
              onClick={() => { setAddingCard(true); setAddingAccount(false); }}
              className="flex items-center gap-1 text-[11px] font-bold text-primary"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Novo
            </button>
          </div>

          {/* Inline new card form */}
          {addingCard && (
            <div className="mb-2">
              <InlineForm
                onSave={handleSaveCard}
                onCancel={() => { setAddingCard(false); setNewName(""); setNewCreditLimit(""); }}
                saveLabel="Salvar cartão"
                fields={
                  <>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nome do cartão"
                      className="mb-2 w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                      autoFocus
                    />
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={newCreditLimit}
                        onChange={(e) => setNewCreditLimit(e.target.value)}
                        placeholder="Limite (R$)"
                        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                      />
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={newClosingDay}
                        onChange={(e) => setNewClosingDay(e.target.value)}
                        placeholder="Fechamento"
                        className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                      />
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={newDueDay}
                      onChange={(e) => setNewDueDay(e.target.value)}
                      placeholder="Vencimento"
                      className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary"
                    />
                  </>
                }
              />
            </div>
          )}

          <div className="flex flex-wrap gap-[7px]">
            {creditCards.map((card) => {
              const selected = cardId === card.id;
              const color = card.color ?? "#820AD1";
              const short = card.name.slice(0, 2).toUpperCase();
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setCardId(card.id === cardId ? "" : card.id)}
                  className={`flex items-center gap-2 rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${
                    selected ? "bg-primary text-white" : "bg-fill-light text-text-secondary"
                  }`}
                >
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] font-mono text-[8px] font-bold" style={{ background: color, color: "#fff" }}>
                    {short}
                  </span>
                  {card.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Parcelamento (expense only) */}
      {isExpense && (
        <fieldset>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Parcelar</label>
            <button
              type="button"
              onClick={() => setInstallmentsEnabled(!installmentsEnabled)}
              className={`flex h-[24px] w-[40px] flex-none items-center rounded-full p-[2px] transition-colors ${installmentsEnabled ? "bg-primary" : "bg-fill-strong"}`}
              aria-label="Alternar parcelamento"
            >
              <span className={`block h-5 w-5 transform rounded-full bg-surface transition-transform ${installmentsEnabled ? "translate-x-[16px]" : "translate-x-0"}`} />
            </button>
          </div>
          {installmentsEnabled && (
            <div className="rounded-[13px] border border-border bg-fill-light px-3.5 py-3">
              <div className="mb-2 flex items-center justify-between text-[12px] text-text-secondary">
                <span>Número de parcelas</span>
                <span className="font-mono font-bold text-text-primary">{installmentsCount}x</span>
              </div>
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {[2, 3, 6, 10, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setInstallmentsCount(n)}
                    className={`rounded-[100px] px-3 py-1.5 text-[11px] font-bold transition-colors ${
                      installmentsCount === n ? "bg-primary text-white" : "bg-surface text-text-secondary"
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-secondary">Outro:</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={2}
                  max={48}
                  value={[2, 3, 6, 10, 12].includes(installmentsCount) ? "" : installmentsCount}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (n >= 2 && n <= 48) setInstallmentsCount(n);
                  }}
                  placeholder="18"
                  className="w-[72px] rounded-[10px] border border-border bg-surface px-3 py-2 text-center font-mono text-[14px] font-semibold text-text-primary outline-none focus:border-primary"
                />
                <span className="text-[12px] text-text-secondary">× vezes</span>
              </div>
              {amountCents > 0 && (
                <div className="mt-2.5 border-t border-border pt-2.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-text-muted">Cada parcela</span>
                    <span className="font-mono font-bold text-text-primary">{installmentsCount}x {formatBRL(installmentCents)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px]">
                    <span className="text-text-muted">Total parcelado</span>
                    <span className="font-mono text-text-secondary">{formatBRL(amountCents)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </fieldset>
      )}

      {/* Transfer accounts */}
      {isTransfer && (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Origem (saída)</span>
              <button
                type="button"
                onClick={() => { setAddingAccount(true); }}
                className="flex items-center gap-1 text-[11px] font-bold text-primary"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Nova
              </button>
            </div>

            {addingAccount && (
              <div className="mb-2">
                <InlineForm
                  onSave={handleSaveAccount}
                  onCancel={() => { setAddingAccount(false); setNewName(""); setNewInitialBalance(""); }}
                  saveLabel="Salvar conta"
                  fields={
                    <>
                      <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da conta" className="mb-2 w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary" autoFocus />
                      <input type="text" inputMode="numeric" value={newInitialBalance} onChange={(e) => setNewInitialBalance(e.target.value)} placeholder="Saldo inicial (R$)" className="w-full rounded-[10px] border border-border bg-surface px-3 py-2.5 text-[13px] text-text-primary outline-none focus:border-primary" />
                    </>
                  }
                />
              </div>
            )}

            <div className="flex flex-wrap gap-[7px] mb-3">
              {filteredAccounts.map((acc) => {
                const selected = fromAccountId === acc.id;
                const color = acc.color ?? "#4A5568";
                const short = acc.name.slice(0, 2).toUpperCase();
                return (
                  <button key={acc.id} type="button" onClick={() => setFromAccountId(acc.id === fromAccountId ? "" : acc.id)}
                    className={`flex items-center gap-2 rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${selected ? "bg-primary text-white" : "bg-fill-light text-text-secondary"}`}
                  >
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] font-mono text-[8px] font-bold" style={{ background: color, color: "#fff" }}>{short}</span>
                    {acc.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Destino (entrada)</span>
            </div>
            <div className="flex flex-wrap gap-[7px]">
              {filteredAccounts.map((acc) => {
                const selected = toAccountId === acc.id;
                const color = acc.color ?? "#4A5568";
                const short = acc.name.slice(0, 2).toUpperCase();
                return (
                  <button key={acc.id} type="button" onClick={() => setToAccountId(acc.id === toAccountId ? "" : acc.id)}
                    className={`flex items-center gap-2 rounded-[100px] px-3.5 py-2 text-[12px] font-bold transition-colors ${selected ? "bg-primary text-white" : "bg-fill-light text-text-secondary"}`}
                  >
                    <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] font-mono text-[8px] font-bold" style={{ background: color, color: "#fff" }}>{short}</span>
                    {acc.name}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={amountCents <= 0}
        className="w-full rounded-[14px] bg-primary py-4 text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isTransfer ? "Transferir" : installmentsEnabled ? `Salvar em ${installmentsCount}x` : "Salvar"}
      </button>
    </div>
  );
}
