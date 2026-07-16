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

        <button type="button" onClick={handleSave}
          className="mt-2 w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90">
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
    <div className="border-b border-fill-medium py-3 last:border-none">
      <div className="flex items-center gap-2">
        <div className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-fill-light">
          <CategoryBadge name={cat.name} size={20} />
        </div>
        <span className="flex-1 text-[13.5px] font-semibold text-text-primary">{cat.name}</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setAdding(!adding)}
            className="rounded-full bg-fill-light px-[9px] py-[3px] text-[10px] font-bold text-text-secondary hover:bg-fill-medium transition-colors">
            + Sub
          </button>
          {onEdit && (
            <button type="button" onClick={() => onEdit({ id: cat.id, name: cat.name })}
              className="px-[7px] py-[3px] text-[10px] font-semibold text-text-secondary hover:text-text-primary transition-colors">
              Editar
            </button>
          )}
          {onDeactivate && (
            <button type="button" onClick={() => onDeactivate({ id: cat.id, name: cat.name })}
              className="px-[7px] py-[3px] text-[10px] font-semibold text-danger/70 hover:text-danger transition-colors">
              Desativar
            </button>
          )}
        </div>
      </div>

      {cat.subcategories && cat.subcategories.length > 0 && (
        <div className="ml-[46px] mt-[7px] flex flex-wrap gap-x-3 gap-y-1">
          {cat.subcategories.map((sub) => (
            <span key={sub} className="text-[12px] text-text-muted before:mr-1.5 before:content-['·']">
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
            className="h-9 flex-1 rounded-[10px] border-2 border-primary bg-surface px-3 text-[13px] text-text-primary outline-none placeholder:text-text-muted" />
          <button type="button" onClick={handleAdd} className="h-9 flex-none rounded-[10px] bg-primary px-3.5 text-[12px] font-bold text-white">OK</button>
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
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Nome
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[13px] border border-border bg-transparent px-3.5 py-3 text-[14px] text-text-primary outline-none focus:border-primary"
          />
        </fieldset>
        <button
          type="button"
          onClick={handleSave}
          className="w-full rounded-[14px] bg-primary py-[15px] text-center text-[15px] font-bold text-white transition-opacity hover:opacity-90"
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

        <StaleBanner domains={["categories"]} />

        <div className="flex flex-col gap-6 px-5 py-4">
          <section>
            <div className="mb-3 rounded-[10px] bg-danger-tint/30 px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-danger">Despesas</span>
              <span className="ml-2 text-[10px] text-text-muted">{expenseCategories.length} categoria{expenseCategories.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-border bg-surface px-[14px]">
              {expenseCategories.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-text-muted">Nenhuma categoria de despesa.</div>
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
            <div className="mb-3 rounded-[10px] bg-primary-tint/30 px-3 py-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-primary">Receitas</span>
              <span className="ml-2 text-[10px] text-text-muted">{incomeCategories.length} categoria{incomeCategories.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-hidden rounded-[16px] border border-border bg-surface px-[14px]">
              {incomeCategories.length === 0 ? (
                <div className="px-3 py-4 text-center text-[12px] text-text-muted">Nenhuma categoria de receita.</div>
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
