"use client";

import { useState, useEffect } from "react";
import BottomSheet from "@/components/BottomSheet";
import { useAppState } from "@/lib/state/app-state-context";
import type { Transaction } from "@/lib/state/types";

function formatInputBRL(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const intPart = padded.slice(0, -2);
  const decPart = padded.slice(-2);
  return `${parseInt(intPart, 10).toLocaleString("pt-BR")},${decPart}`;
}

function parseInputBRL(value: string): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10);
}

interface TransactionEditSheetProps {
  open: boolean;
  transaction: Transaction | null;
  onClose: () => void;
}

export function TransactionEditSheet({
  open,
  transaction,
  onClose,
}: TransactionEditSheetProps) {
  const { updateTransaction, categories, accounts } = useAppState();
  const isTransfer = transaction?.kind === "transfer";

  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");

  useEffect(() => {
    if (transaction) {
      setDescription(transaction.description);
      setDate(transaction.date);
      setAmountStr(formatInputBRL(String(transaction.amountCents)));
      setCategoryId(transaction.categoryId ?? "");
      setAccountId(transaction.accountId);
    }
  }, [transaction]);

  if (!transaction) return null;

  const filteredCategories = categories.filter(
    (c) => c.kind === (transaction.kind === "income" ? "income" : "expense"),
  );

  const handleSave = async () => {
    if (!description.trim() || !date) return;

    const input: {
      description?: string;
      date?: string;
      amountCents?: number;
      accountId?: string;
      categoryId?: string;
    } = {
      description: description.trim(),
      date,
    };

    if (!isTransfer) {
      const parsed = parseInputBRL(amountStr);
      if (parsed > 0) input.amountCents = parsed;
      if (accountId) input.accountId = accountId;
      if (categoryId) input.categoryId = categoryId;
    }

    await updateTransaction(transaction.id, input);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar lançamento">
      <div className="flex flex-col gap-4">
        {/* Description */}
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Descrição
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text-primary outline-none"
          />
        </div>

        {/* Date */}
        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Data
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text-primary outline-none"
          />
        </div>

        {/* Amount (not for transfers) */}
        {!isTransfer && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Valor (R$)
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(formatInputBRL(e.target.value))}
              placeholder="0,00"
              className="w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text-primary outline-none"
            />
          </div>
        )}

        {/* Category (not for transfers) */}
        {!isTransfer && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Categoria
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text-primary outline-none"
            >
              <option value="">Sem categoria</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Account (not for transfers) */}
        {!isTransfer && (
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Conta
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-[12px] border border-border bg-surface px-3.5 py-2.5 text-[13px] text-text-primary outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kind === "credit_card" ? `Cartão • ${a.name}` : `Conta • ${a.name}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          className="w-full rounded-[12px] bg-primary py-3 text-[13px] font-bold text-white transition-opacity active:opacity-80"
        >
          Salvar
        </button>
      </div>
    </BottomSheet>
  );
}
