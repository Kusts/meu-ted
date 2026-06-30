"use client";

import { useState } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import Icon from "@/components/ui/Icon";
import { useAppState } from "@/lib/state/app-state-context";

const ICON_PRESETS = [
  { value: "UtensilsCrossed", icon: "tag" },
  { value: "Car", icon: "exchange" },
  { value: "Home", icon: "home" },
  { value: "Heart", icon: "info" },
  { value: "DollarSign", icon: "wallet" },
  { value: "Laptop", icon: "folder-open" },
  { value: "ShoppingBag", icon: "credit-card" },
  { value: "Gift", icon: "target" },
  { value: "Briefcase", icon: "chart" },
  { value: "Zap", icon: "alert-triangle" },
  { value: "Film", icon: "trend-up" },
  { value: "Book", icon: "trend-down" },
  { value: "Plane", icon: "arrow-up-right" },
  { value: "Gamepad2", icon: "circle-plus" },
] as const;

const COLOR_PRESETS = [
  "#0E8C5A", "#C8483B", "#B8791F", "#3E6FB0", "#2FA56F",
  "#820AD1", "#EC7000",
];

function NewCategorySheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (input: { name: string; kind: "expense" | "income"; parentId?: string }) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState("#0E8C5A");

  function handleSave() {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), kind });
    setName("");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Nova categoria">
      <div className="flex flex-col gap-4">
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação, Salário..."
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary" />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Tipo</label>
          <div className="flex gap-1 rounded-xl bg-fill-light p-1">
            {[{ v: "expense" as const, l: "Despesa" }, { v: "income" as const, l: "Receita" }].map((t) => (
              <button key={t.v} type="button" onClick={() => setKind(t.v)}
                className={`flex-1 rounded-[10px] py-2 text-center text-[12px] font-bold transition-colors ${kind === t.v ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Ícone</label>
          <div className="grid grid-cols-7 gap-2">
            {ICON_PRESETS.map((i) => (
              <button key={i.value} type="button" onClick={() => setIcon(i.icon)}
                className={`flex h-10 items-center justify-center rounded-[10px] transition-colors ${icon === i.icon ? "bg-primary text-white" : "bg-fill-light text-text-secondary"}`}>
                <Icon name={i.icon} size={18} strokeWidth="2" />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">Cor</label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full transition-all ${color === c ? "ring-2 ring-text-primary ring-offset-2 ring-offset-surface" : ""}`}
                style={{ background: c }} aria-label={`Cor ${c}`} />
            ))}
          </div>
        </fieldset>

        <button type="button" onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90">
          Salvar categoria
        </button>
      </div>
    </BottomSheet>
  );
}

// Icon name mapping — matches what CategoriesPage handles
const CATEGORY_ICON_MAP: Record<string, import("@/components/ui/Icon").IconName> = {
  UtensilsCrossed: "tag",
  Car: "exchange",
  Home: "home",
  Heart: "info",
  DollarSign: "wallet",
  Laptop: "folder-open",
  ShoppingBag: "credit-card",
  Gift: "target",
  Briefcase: "chart",
  Zap: "alert-triangle",
  Film: "trend-up",
  Book: "trend-down",
  Plane: "arrow-up-right",
  Gamepad2: "circle-plus",
};

function CategoryIconView({ icon }: { icon: string }) {
  const name = CATEGORY_ICON_MAP[icon] ?? "tag";
  return <Icon name={name} size={17} strokeWidth="1.9" />;
}

interface CategoryRowProps {
  cat: { id: string; name: string; icon: string; subcategories?: string[] };
  onAddSub?: (input: { name: string; kind: "expense" | "income"; parentId: string }) => void;
}

function CategoryRow({ cat, onAddSub }: CategoryRowProps) {
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState("");

  function handleAdd() {
    if (!newSub.trim() || !onAddSub) return;
    onAddSub({ name: newSub.trim(), kind: "expense" as const, parentId: cat.id });
    setNewSub("");
    setAdding(false);
  }

  return (
    <div className="border-b border-fill-medium py-3 last:border-none">
      <div className="flex items-center gap-3">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-fill-light">
          <CategoryIconView icon={cat.icon} />
        </div>
        <span className="flex-1 text-[13.5px] font-semibold text-text-primary">{cat.name}</span>
        <button type="button" onClick={() => setAdding(!adding)}
          className="rounded-full bg-fill-light px-[10px] py-[4px] text-[11px] font-semibold text-text-secondary"
          style={{ border: "1px solid #E0E3DE" }}>+ Sub</button>
        <button type="button" className="px-0.5 text-text-muted">
          <Icon name="chevron-right" size={16} />
        </button>
      </div>

      {cat.subcategories && cat.subcategories.length > 0 && (
        <div className="ml-[46px] mt-[9px] flex flex-wrap gap-[6px]">
          {cat.subcategories.map((sub) => (
            <span key={sub} className="flex items-center gap-1 rounded-full bg-fill-light px-[10px] py-[4px]" style={{ border: "1px solid #E0E3DE" }}>
              <span className="text-[11px] font-semibold text-text-primary">{sub}</span>
              <button type="button" className="text-[14px] leading-none text-text-muted" aria-label={`Remover ${sub}`}>×</button>
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div className="ml-[46px] mt-2.5 flex items-center gap-1.5">
          <input type="text" value={newSub} onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewSub(""); } }}
            placeholder="Nome da subcategoria…" autoFocus
            className="h-9 flex-1 rounded-[10px] border-2 border-primary bg-surface px-3 text-[13px] text-text-primary outline-none placeholder:text-text-muted" />
          <button type="button" onClick={handleAdd} className="h-9 flex-none rounded-[10px] bg-primary px-3.5 text-[12px] font-bold text-white">OK</button>
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const { categories, loading, error, addCategory } = useAppState();
  const [createOpen, setCreateOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg"><StatusBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-fill-medium border-t-primary" />
            <span className="text-[13px] font-semibold text-text-muted">Carregando...</span>
          </div>
        </div>
      </div>
    );
  }

  const expenseCategories = categories.filter((c) => c.kind === "expense");
  const incomeCategories = categories.filter((c) => c.kind === "income");

  return (
    <div className="flex min-h-dvh flex-col bg-bg"><StatusBar />
      <main className="flex flex-1 flex-col pb-[var(--tab-bar-height)]">
        <PageHeader title="Categorias" action={
          <button type="button" onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-[15px] py-[9px] text-[12px] font-bold text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Nova
          </button>
        } />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">⚠ {error}</div>
        )}

        <WriteErrorBanner message={writeError} onDismiss={clearWriteError} />

        <div className="flex flex-col gap-5 px-5 py-4">
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-[10px] w-[10px] rounded-full bg-danger" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Despesas</span>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-border bg-surface px-[14px]">
              {expenseCategories.map((cat) => <CategoryRow key={cat.id} cat={cat} onAddSub={addCategory} />)}
            </div>
          </section>
          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <span className="h-[10px] w-[10px] rounded-full bg-primary" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Receitas</span>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-border bg-surface px-[14px]">
              {incomeCategories.map((cat) => <CategoryRow key={cat.id} cat={cat} onAddSub={addCategory} />)}
            </div>
          </section>
        </div>
      </main>
      <NewCategorySheet open={createOpen} onClose={() => setCreateOpen(false)} onAdd={addCategory} />
    </div>
  );
}
