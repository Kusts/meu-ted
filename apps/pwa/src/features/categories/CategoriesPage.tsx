"use client";

import { useState, useEffect } from "react";
import StatusBar from "@/components/StatusBar";
import PageHeader from "@/components/PageHeader";
import BottomSheet from "@/components/BottomSheet";
import { WriteErrorBanner } from "@/components/WriteErrorBanner";
import { CategoryBadge } from "@/components/ui/CategoryBadge";
import { StaleBanner } from "@/components/StaleBanner";
import { ConfirmActionDialog } from "@/components/ConfirmActionDialog";
import { useAppState } from "@/lib/state/app-state-context";
import { Plus } from "lucide-react";

function NewCategorySheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (input: { name: string; kind: "expense" | "income"; parentId?: string }) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");

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
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Nome</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Alimentação, Salário..."
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary" />
        </fieldset>

        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">Tipo</label>
          <div className="flex gap-1 rounded-[14px] bg-surface-2 p-1 border border-border-subtle">
            {[{ v: "expense" as const, l: "Despesa" }, { v: "income" as const, l: "Receita" }].map((t) => (
              <button key={t.v} type="button" onClick={() => setKind(t.v)}
                className={`flex-1 rounded-[10px] py-2.5 text-center text-[12px] font-bold transition-all ${kind === t.v ? "bg-surface-1 text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"}`}>
                {t.l}
              </button>
            ))}
          </div>
        </fieldset>

        <button type="button" onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98]">
          Salvar categoria
        </button>
      </div>
    </BottomSheet>
  );
}

interface CategoryRowProps {
  cat: { id: string; name: string; subcategories?: string[] };
  onAddSub?: (input: { name: string; kind: "expense" | "income"; parentId: string }) => void;
  onEdit?: (cat: { id: string; name: string }) => void;
  onDeactivate?: (cat: { id: string; name: string }) => void;
}

function CategoryRow({ cat, onAddSub, onEdit, onDeactivate }: CategoryRowProps) {
  const [adding, setAdding] = useState(false);
  const [newSub, setNewSub] = useState("");

  function handleAdd() {
    if (!newSub.trim() || !onAddSub) return;
    onAddSub({ name: newSub.trim(), kind: "expense" as const, parentId: cat.id });
    setNewSub("");
    setAdding(false);
  }

  return (
    <div className="border-b border-border-subtle py-3 last:border-none">
      <div className="flex items-center gap-2.5">
        <div className="flex h-[36px] w-[36px] flex-none items-center justify-center rounded-[10px] bg-surface-2 shadow-xs">
          <CategoryBadge name={cat.name} size={20} />
        </div>
        <span className="flex-1 text-[14px] font-bold text-text-primary">{cat.name}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setAdding(!adding)}
            className="rounded-full bg-surface-2 border border-border-subtle px-2.5 py-1 text-[10px] font-bold text-text-secondary hover:bg-surface-3 transition-colors">
            + Sub
          </button>
          {onEdit && (
            <button type="button" onClick={() => onEdit({ id: cat.id, name: cat.name })}
              className="px-2 py-1 text-[11px] font-semibold text-text-muted hover:text-text-primary transition-colors">
              Editar
            </button>
          )}
          {onDeactivate && (
            <button type="button" onClick={() => onDeactivate({ id: cat.id, name: cat.name })}
              className="px-2 py-1 text-[11px] font-semibold text-danger/70 hover:text-danger transition-colors">
              Desativar
            </button>
          )}
        </div>
      </div>

      {cat.subcategories && cat.subcategories.length > 0 && (
        <div className="ml-[46px] mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {cat.subcategories.map((sub) => (
            <span key={sub} className="text-[12px] text-text-muted font-medium before:mr-1.5 before:content-['·']">
              {sub}
            </span>
          ))}
        </div>
      )}

      {adding && (
        <div className="ml-[46px] mt-2.5 flex items-center gap-1.5">
          <input type="text" value={newSub} onChange={(e) => setNewSub(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewSub(""); } }}
            placeholder="Nome da subcategoria…" autoFocus
            className="h-9 flex-1 rounded-[10px] border-2 border-primary bg-surface-1 px-3 text-[13px] text-text-primary outline-none placeholder:text-text-muted" />
          <button type="button" onClick={handleAdd} className="h-9 flex-none rounded-[10px] bg-primary px-3.5 text-[12px] font-bold text-white shadow-xs">OK</button>
        </div>
      )}
    </div>
  );
}

function CategoryEditSheet({ open, category, onClose, onSave }: {
  open: boolean;
  category: { id: string; name: string } | null;
  onClose: () => void;
  onSave: (id: string, name: string) => void;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (category) setName(category.name);
  }, [category]);

  function handleSave() {
    if (!category || !name.trim()) return;
    onSave(category.id, name.trim());
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Editar categoria">
      <div className="flex flex-col gap-4">
        <fieldset>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[14px] border border-border-subtle bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-text-primary outline-none focus:border-primary"
          />
        </fieldset>
        <button
          type="button"
          onClick={handleSave}
          className="w-full rounded-[14px] bg-primary py-3.5 text-center text-[15px] font-bold text-white shadow-fab transition-all hover:bg-primary-hover active:scale-[0.98]"
        >
          Salvar
        </button>
      </div>
    </BottomSheet>
  );
}

export default function CategoriesPage() {
  const { categories, loading, error, writeError, clearWriteError, addCategory, updateCategory, deactivateCategory } = useAppState();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<{ id: string; name: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState<{ id: string; name: string } | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg"><StatusBar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border-subtle border-t-primary" />
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
            className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-white shadow-sm hover:bg-primary-hover active:scale-95 transition-all">
            <Plus size={15} strokeWidth={2.4} />
            Nova
          </button>
        } />

        {error && (
          <div className="mx-5 mb-3 rounded-[12px] bg-danger-tint px-4 py-2.5 text-[12px] font-semibold text-danger">⚠ {error}</div>
        )}

        <WriteErrorBanner message={writeError} onDismiss={clearWriteError} />

        <StaleBanner domains={["categories"]} />

        <div className="flex flex-col gap-6 px-5 py-4 sm:px-8 lg:px-12">
          <section>
            <div className="mb-2.5 flex items-center justify-between rounded-[12px] bg-danger-tint/30 px-3.5 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-danger">Despesas</span>
              <span className="text-[10px] font-bold text-text-muted">{expenseCategories.length} categoria{expenseCategories.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-hidden rounded-[18px] border border-border-subtle bg-surface-1 px-4 shadow-card">
              {expenseCategories.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-text-muted">Nenhuma categoria de despesa.</div>
              ) : (
                expenseCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    cat={cat}
                    onAddSub={addCategory}
                    onEdit={(c) => {
                      setEditCategory(c);
                      setEditOpen(true);
                    }}
                    onDeactivate={(c) => setConfirmDeactivate(c)}
                  />
                ))
              )}
            </div>
          </section>
          <section>
            <div className="mb-2.5 flex items-center justify-between rounded-[12px] bg-primary-tint/30 px-3.5 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Receitas</span>
              <span className="text-[10px] font-bold text-text-muted">{incomeCategories.length} categoria{incomeCategories.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-hidden rounded-[18px] border border-border-subtle bg-surface-1 px-4 shadow-card">
              {incomeCategories.length === 0 ? (
                <div className="px-3 py-6 text-center text-[12px] text-text-muted">Nenhuma categoria de receita.</div>
              ) : (
                incomeCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    cat={cat}
                    onAddSub={addCategory}
                    onEdit={(c) => {
                      setEditCategory(c);
                      setEditOpen(true);
                    }}
                    onDeactivate={(c) => setConfirmDeactivate(c)}
                  />
                ))
              )}
            </div>
          </section>
        </div>
      </main>
      <NewCategorySheet open={createOpen} onClose={() => setCreateOpen(false)} onAdd={addCategory} />

      <CategoryEditSheet
        open={editOpen}
        category={editCategory}
        onClose={() => {
          setEditOpen(false);
          setEditCategory(null);
        }}
        onSave={(id, name) => updateCategory(id, { name })}
      />

      <ConfirmActionDialog
        open={confirmDeactivate !== null}
        title="Desativar categoria"
        message={`Tem certeza que deseja desativar a categoria "${confirmDeactivate?.name ?? ""}"? Esta ação pode ser desfeita.`}
        confirmLabel="Desativar"
        danger
        onConfirm={() => {
          if (confirmDeactivate) deactivateCategory(confirmDeactivate.id);
          setConfirmDeactivate(null);
        }}
        onCancel={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}
